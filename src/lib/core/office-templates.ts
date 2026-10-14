import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { findAsset, getAsset, type Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { publishedSource, type BrandSource } from "@/lib/core/page-view";
import { renderAsset } from "@/lib/core/renditions";
import { latestVersion } from "@/lib/core/versions";
import { colorsOf } from "@/lib/brand-theme";
import { deliverable } from "@/lib/lifecycle";
import { officeLook } from "@/lib/office";
import { inspect, mediaMime, retheme, TEMPLATE_KINDS, templateKind, type Part } from "@/lib/office-template";
import { hasPreview } from "@/lib/preview";
import { getObject, originalKey } from "@/lib/storage";
import { unzip, zip } from "@/lib/zip";

/**
 * A brand's own Office templates (lib/office-template.ts): the PowerPoint,
 * Word and Excel files on a release's rules, each at its latest version,
 * approved and usable now, that the caller may see. Listed with what in
 * them won't follow the brand, and downloaded wearing the release: its
 * theme, and each library image at its current version. Like the generated
 * templates (lib/core/office.ts), nothing is written at release: each
 * download is made from the release it asks for.
 */

/** What a package may inflate to in all, past which it isn't read: a zip bomb stops here. */
const UNPACKED = 256 * 1024 * 1024;

async function sourceOf(ws: string, slug: string | undefined, version: "live" | number) {
  const src = await publishedSource(ws, slug, version === "live" ? undefined : version);
  if (!src) throw new AssetError("not_found", version === "live" ? "That brand isn't released yet" : `Version ${version} was never released`);
  return src;
}

/** The release's templates: each Office file on its rules, at its latest version, once. */
async function templatesIn(caller: Caller, src: BrandSource) {
  const out: Asset[] = [];
  for (const id of new Set(src.rules.flatMap((r) => r.assets.map((a) => a.id)))) {
    const a = await getAsset(caller, id);
    if (!a || a.deletedAt || !templateKind(a)) continue;
    const at = await latestVersion(a);
    if (deliverable(at) && !at.deletedAt && !out.some((o) => o.id === at.id)) out.push(at);
  }
  return out;
}

async function partsOf(a: Asset): Promise<Part[]> {
  const entries = unzip(await getObject(originalKey(a.sha256)));
  if (!entries.length) throw new AssetError("invalid", `${a.filename} isn't an Office file that can be opened`);
  const parts: Part[] = [];
  let left = UNPACKED;
  for (const e of entries) {
    const data = await e.read(left);
    left -= data.length;
    parts.push({ name: e.name, data });
  }
  return parts;
}

/** Each image as the library knows it: the asset it is (null: unknown), and its current version when that is another. */
async function bindings(projectId: string, images: { name: string; sha256: string }[]) {
  const known = images.length
    ? await db
        .select({ id: assets.id, sha256: assets.sha256 })
        .from(assets)
        .where(and(eq(assets.projectId, projectId), inArray(assets.sha256, [...new Set(images.map((i) => i.sha256))]), isNull(assets.deletedAt)))
    : [];
  return Promise.all(
    images.map(async (img) => {
      const row = known.find((k) => k.sha256 === img.sha256);
      const asset = row ? await findAsset(row.id) : null;
      const now = asset && (await latestVersion(asset));
      return { ...img, asset, current: now && now.id !== asset!.id ? now : null };
    }),
  );
}

/** An asset's bytes as the image it replaces: as stored when the format is the same, else drawn in it. Null when it can't stand in. */
async function bytesAs(a: Asset, name: string): Promise<Uint8Array | null> {
  if (!deliverable(a)) return null;
  const mime = mediaMime(name);
  if (a.mime === mime) return getObject(originalKey(a.sha256));
  const f = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpeg" : null;
  if (!f || !hasPreview(a)) return null;
  // ponytail: the frame keeps its size, so a replacement of another shape is stretched to it. Fit it in the frame's extents if that shows up.
  const { body } = await renderAsset(a, { w: 2000, h: 2000, fit: "inside", f });
  return new Uint8Array(await new Response(body).arrayBuffer());
}

const lookOf = (src: BrandSource) => officeLook(src.brand.name, src.rules, src.theme);

/**
 * GET /api/v1/brand/office/templates: the release's templates, each with
 * what won't follow the brand. `follows` when nothing: its theme is there,
 * nothing is written outside it, and every image is the library's.
 */
export async function brandTemplates(caller: Caller, slug: string | undefined, version: "live" | number) {
  const src = await sourceOf(caller.project.id, slug, version);
  const look = lookOf(src);
  const allowed = colorsOf(src.rules).map((r) => r.value as string);
  return Promise.all(
    (await templatesIn(caller, src)).map(async (a) => {
      const kind = templateKind(a)!;
      const head = { id: a.id, filename: a.filename, title: a.metadata?.title ?? null, kind, app: TEMPLATE_KINDS[kind].app };
      try {
        const c = inspect(await partsOf(a), look, allowed);
        const bound = await bindings(caller.project.id, c.images);
        const images = { total: bound.length, library: bound.filter((b) => b.asset).length, updated: bound.filter((b) => b.current).length };
        return { ...head, error: null, themes: c.themes, colors: c.colors, fonts: c.fonts, images, follows: c.themes > 0 && !c.colors.length && !c.fonts.length && images.library === images.total };
      } catch (err) {
        // One file that can't be read leaves the others listed.
        return { ...head, error: err instanceof Error ? err.message : "It can't be read", themes: 0, colors: [], fonts: [], images: { total: 0, library: 0, updated: 0 }, follows: false };
      }
    }),
  );
}

/**
 * GET /api/v1/brand/office/templates/{id}: that template wearing the
 * release. One release is one file byte for byte (its times are the
 * release's), so its ETag holds until the release, the file or an image's
 * current version changes.
 *
 * ponytail: written back uncompressed (lib/zip.ts stores), so its XML takes
 * a few times the room it did. Deflate on write if a deck's size matters.
 */
export async function brandTemplateFile(caller: Caller, slug: string | undefined, version: "live" | number, id: string) {
  const src = await sourceOf(caller.project.id, slug, version);
  const t = (await templatesIn(caller, src)).find((a) => a.id === id);
  if (!t) throw new AssetError("not_found", "That isn't one of this release's templates");
  const look = lookOf(src);
  const parts = await partsOf(t);
  const swap = new Map<string, Uint8Array>();
  for (const b of await bindings(caller.project.id, inspect(parts, look).images)) {
    const bytes = b.current && (await bytesAs(b.current, b.name));
    if (bytes) swap.set(b.name, bytes);
  }
  const date = src.version?.publishedAt ? new Date(src.version.publishedAt) : t.createdAt;
  const bytes = zip(retheme(parts, look, swap).map((p) => ({ ...p, date })));
  const kind = templateKind(t)!;
  const release = src.version ? `-v${src.version.number}` : "";
  return {
    bytes,
    mime: TEMPLATE_KINDS[kind].mime,
    filename: t.filename.replace(/(\.[a-z]{4})?$/i, `${release}.${kind}`),
    etag: `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`,
  };
}
