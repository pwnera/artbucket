import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, portals, siteDeployments } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { enterPortal, type Pass } from "@/lib/core/portals";
import { can } from "@/lib/permissions";
import { BUILD_KINDS, candidates, contentTypeOf, MANIFEST, MAX_SITE_BYTES, MAX_SITE_FILES, mountPath, siteFiles, type BuildKind } from "@/lib/sites";
import { putObject, sizeOf } from "@/lib/storage";
import { unzip } from "@/lib/zip";

/**
 * Sites' deployments (PRD part 2): a zip of static files, unpacked into
 * storage under its own prefix, checked, then live at its mount path, the one
 * live before it kept as `replaced` to restore. A brand portal's root stays
 * Artbucket's; builds mount beside it at a path (/docs, /storybook). The
 * files are served on the site's own address only (src/proxy.ts), never under
 * /p/ on the app's host, where customer JavaScript would run beside a
 * signed-in session.
 */

type Deployment = typeof siteDeployments.$inferSelect;

const present = (d: Deployment) => ({
  id: d.id,
  path: d.path,
  kind: d.kind,
  state: d.state,
  files: d.files,
  bytes: d.bytes,
  commit: d.commit,
  ref: d.ref,
  error: d.error,
  manifest: d.manifest,
  createdBy: d.createdBy,
  createdAt: d.createdAt,
});

function mayDeploy(caller: Caller) {
  if (!can(caller, "portal.manage")) throw new AssetError("forbidden", "Deploying a site takes write on the project");
}

async function siteOf(caller: Caller, id: string) {
  const [s] = await db.select().from(portals).where(and(eq(portals.id, id), eq(portals.projectId, caller.project.id)));
  return s ?? null;
}

/** The site's deployments, newest first. Null: no such site here. */
export async function listDeployments(caller: Caller, siteId: string) {
  mayDeploy(caller);
  if (!(await siteOf(caller, siteId))) return null;
  const rows = await db.select().from(siteDeployments).where(eq(siteDeployments.siteId, siteId)).orderBy(desc(siteDeployments.createdAt)).limit(50);
  return rows.map(present);
}

type Manifest = { release?: number; assets?: string[]; rules?: string[] };

/**
 * What a build read, checked as check_use would: every asset it names is the
 * project's, approved, current and unexpired. The reasons, or none.
 */
async function manifestProblems(projectId: string, m: Manifest) {
  const ids = (Array.isArray(m.assets) ? m.assets : []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return [];
  const rows = await db
    .select({ id: assets.id, name: assets.filename, projectId: assets.projectId, status: assets.status, supersededBy: assets.supersededBy, rights: assets.rights })
    .from(assets)
    .where(inArray(assets.id, ids));
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const a = byId.get(id);
    if (!a || a.projectId !== projectId) return [`${id} is not an asset of this project`];
    if (a.supersededBy) return [`${a.name} was replaced (use ${a.supersededBy})`];
    if (a.status !== "active") return [`${a.name} is not approved`];
    if (a.rights?.expires && a.rights.expires < today) return [`${a.name}'s license ended on ${a.rights.expires}`];
    return [];
  });
}

/**
 * Deploy a zip to a site at a mount path: refused outright when it can't
 * serve (no index.html, a name outside the site, too big); otherwise
 * recorded, and failed with the reason when its manifest names an asset that
 * may not be used. Live once every file is stored.
 */
export async function deploy(caller: Caller, siteId: string, zip: Uint8Array, o: { path?: string | null; kind?: string | null; commit?: string | null; ref?: string | null } = {}) {
  mayDeploy(caller);
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  const path = mountPath(o.path ?? "/");
  if (!path) throw new AssetError("invalid", "path: / or lowercase segments, such as /docs");
  if (site.kind === "portal" && path === "/") throw new AssetError("invalid", "A brand portal's root is drawn by Artbucket: mount a build at a path, such as /docs");
  const kind = (o.kind ?? (site.kind === "portal" ? null : site.kind)) as BuildKind | null;
  if (!kind || !BUILD_KINDS.includes(kind)) throw new AssetError("invalid", `kind: one of ${BUILD_KINDS.join(", ")}`);
  if (zip.length > MAX_SITE_BYTES) throw new AssetError("too_large", `A deployment is ${MAX_SITE_BYTES / 1024 / 1024} MB at most`);
  let entries;
  try {
    entries = unzip(zip);
  } catch {
    throw new AssetError("invalid", "That isn't a zip");
  }
  if (!entries.length) throw new AssetError("invalid", "That isn't a zip, or it holds nothing");
  const files = siteFiles(entries.map((e) => e.name));
  if (!files) throw new AssetError("invalid", "A file in the zip names a path outside the site");
  if (files.size > MAX_SITE_FILES) throw new AssetError("invalid", `A deployment holds ${MAX_SITE_FILES} files at most`);
  if (!files.has("index.html")) throw new AssetError("invalid", "No index.html at the zip's root (or in the one folder it wraps)");
  const byName = new Map(entries.map((e) => [e.name, e]));

  const id = randomUUID();
  const prefix = `sites/${site.id}/${id}/`;
  await db.insert(siteDeployments).values({ id, siteId: site.id, path, kind, prefix, commit: o.commit ?? null, ref: o.ref ?? null, createdBy: caller.actor });
  try {
    let bytes = 0;
    let manifest: Manifest | null = null;
    const list = [...files];
    // ponytail: 16 uploads at a time, the zip held in memory; a streaming unpack when deployments grow past MAX_SITE_BYTES.
    for (let i = 0; i < list.length; i += 16) {
      await Promise.all(
        list.slice(i, i + 16).map(async ([served, name]) => {
          const data = await byName.get(name)!.read();
          bytes += data.length;
          if (bytes > MAX_SITE_BYTES) throw new AssetError("too_large", `A deployment is ${MAX_SITE_BYTES / 1024 / 1024} MB unpacked at most`);
          if (served === MANIFEST) manifest = JSON.parse(new TextDecoder().decode(data)) as Manifest;
          await putObject(prefix + served, Buffer.from(data), contentTypeOf(served));
        }),
      );
    }
    const problems = manifest ? await manifestProblems(site.projectId, manifest) : [];
    if (problems.length) throw new AssetError("invalid", `It uses what may not be used: ${problems.join("; ")}`);
    const [live] = await db.transaction(async (tx) => {
      await tx
        .update(siteDeployments)
        .set({ state: "replaced" })
        .where(and(eq(siteDeployments.siteId, site.id), eq(siteDeployments.path, path), eq(siteDeployments.state, "live")));
      return tx.update(siteDeployments).set({ state: "live", files: files.size, bytes, manifest }).where(eq(siteDeployments.id, id)).returning();
    });
    await recordAudit(caller, "site.deployed", site.slug, { path, kind, files: files.size }, { projectId: site.projectId });
    return present(live);
  } catch (err) {
    const why = err instanceof Error ? err.message : "It could not be stored";
    await db.update(siteDeployments).set({ state: "failed", error: why }).where(eq(siteDeployments.id, id));
    throw err instanceof AssetError ? err : new AssetError("invalid", why);
  }
}

/** The live mount paths of a site, longest first: where its builds answer. For src/proxy.ts. */
export async function liveMounts(siteId: string) {
  const rows = await db.select({ path: siteDeployments.path }).from(siteDeployments).where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.state, "live")));
  return rows.map((r) => r.path).sort((a, b) => b.length - a.length);
}

export const underMount = (rest: string, mount: string) => mount === "/" || rest === mount || rest.startsWith(`${mount}/`);

/**
 * The stored file a request to a site asks for, as this visitor may see it
 * (the portal's own gate: a password or members site refuses here), or null
 * when no live build holds the path. A miss answers the build's 404.html.
 */
export async function siteFile(slug: string, pass: Pass, rest: string) {
  const { p } = await enterPortal(slug, pass);
  const live = await db
    .select({ path: siteDeployments.path, prefix: siteDeployments.prefix })
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, p.id), eq(siteDeployments.state, "live")));
  const mount = live.sort((a, b) => b.path.length - a.path.length).find((m) => underMount(rest, m.path));
  if (!mount) return null;
  const inner = mount.path === "/" ? rest : rest.slice(mount.path.length) || "/";
  for (const name of candidates(inner)) {
    const key = mount.prefix + name;
    if ((await sizeOf(key)) !== null) return { key, contentType: contentTypeOf(name), status: name === "404.html" && !inner.endsWith("404.html") ? 404 : 200, open: p.access === "public" };
  }
  return null;
}
