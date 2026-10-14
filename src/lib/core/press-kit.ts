import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brandVersions } from "@/lib/db/schema";
import { columns } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import type { HubBrand } from "@/lib/core/hub";
import { renderAsset } from "@/lib/core/renditions";
import { isFont } from "@/lib/font";
import { gate, pool } from "@/lib/pool";
import { ase, colorsText, kitColors, kitFiles, kitReadme } from "@/lib/press-kit";
import { getObject, originalKey } from "@/lib/storage";
import { TOKEN_FORMATS, type TokenRule } from "@/lib/tokens";
import { type Entry, zip } from "@/lib/zip";

/**
 * A listing's press kit ({org}/{brand}[@n]/press-kit.zip on BrandHub): one
 * zip of the release, for a journalist, a partner or an agent. Its logos
 * (each version, an SVG with a PNG beside it), its palette (colors.txt,
 * colors.ase), its tokens (tokens.css, tokens.json, their @font-face
 * pointing into fonts/), the font files their license lets anyone pass on,
 * and a README: the release, where it came from, how to use each part, and
 * what was left out. Only what the listing already shows anyone who may
 * see it (lib/core/hub.ts hubBrand: deliverable files), less what isn't
 * handed out (lib/rights.ts isDownloadable): those are named, not zipped.
 *
 * Its `etag` changes when anything in it does: the release, a file, the
 * words. Building the bytes waits for `bytes()`, so a client that has it
 * costs a query.
 */

/** The most a kit's files weigh together: past it, the rest are named in the README, not zipped. */
export const KIT_BYTES = 100 * 1024 * 1024;
/** An SVG's PNG: this many pixels on its longer side. */
const PNG = { w: 2048, h: 2048, f: "png", fit: "inside" } as const;
/**
 * Kits built at once, and how many may wait.
 * ponytail: a kit is held in memory whole (lib/zip.ts), up to KIT_BYTES; stream the zip if kits outgrow that.
 */
const building = gate(2, 8);
/** One build per kit, however many ask for it while it runs. */
const inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

export async function pressKit(b: HubBrand) {
  const plan = kitFiles(b.rules);
  const fontIds = b.rules.flatMap((r) => r.assets.filter((a) => isFont(a.mime, a.filename ?? "")).map((a) => a.id));
  const ids = [...new Set([...plan.files.map((f) => f.id), ...fontIds])];
  const [rows, notes] = await Promise.all([
    ids.length ? db.select(columns).from(assets).where(and(inArray(assets.id, ids), eq(assets.projectId, b.projectId))) : [],
    db
      .select({ number: brandVersions.number, note: brandVersions.note })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, b.brandId), isNotNull(brandVersions.publishedAt)))
      .orderBy(asc(brandVersions.number)),
  ]);
  const byId = new Map(rows.map((a) => [a.id, a]));
  // In order, until the kit is full: the marks come first, as the rules list them.
  let weight = 0;
  const left = [...plan.left];
  const files = plan.files.filter((f) => {
    const a = byId.get(f.id);
    if (!a) return false;
    weight += f.png ? 0 : a.size;
    if (weight <= KIT_BYTES) return true;
    left.push(f.path);
    return false;
  });

  const title = `${b.org}/${b.brand}@${b.version} design tokens, from the Artbucket BrandHub (${b.url}).`;
  // The default context's values, its fonts loading from the kit's own files.
  const fontPath = new Map(files.filter((f) => f.path.startsWith("fonts/")).map((f) => [f.id, f.path]));
  const tokenRules = b.rules.filter((r) => r.context === null).map((r) => ({ ...r, assets: r.assets.filter((a) => fontPath.has(a.id)) })) as unknown as TokenRule[];
  const local = (text: string) => text.replace(/\/a\/([0-9a-f-]{36})/g, (m, id: string) => fontPath.get(id) ?? m);
  const colors = kitColors(b.rules);
  const note = (n: number | undefined) => notes.find((v) => v.number === n)?.note ?? null;
  const licenses = new Map(rows.map((a) => [a.id, a.rights?.license ?? null]));
  const readme = kitReadme(
    { name: b.name, owner: b.owner, verified: b.verified, version: b.version, publishedAt: b.publishedAt, url: `${b.url.replace(/@\d+$/, "")}@${b.version}`, guidelines: b.guidelines, terms: b.terms, note: note(b.version), source: note(notes[0]?.number) },
    b.rules,
    { files, left, licenses },
  );
  const enc = new TextEncoder();
  const texts: Entry[] = [
    { name: "README.md", data: enc.encode(readme) },
    ...(colors.length ? [{ name: "colors.txt", data: enc.encode(colorsText(colors)) }, { name: "colors.ase", data: ase(colors) }] : []),
    { name: "tokens.css", data: enc.encode(local(TOKEN_FORMATS.css.render(tokenRules, { origin: "", title }))) },
    { name: "tokens.json", data: enc.encode(local(TOKEN_FORMATS.json.render(tokenRules, { origin: "", title }))) },
  ];
  const hash = createHash("sha256");
  for (const t of texts) hash.update(t.name).update(t.data);
  for (const f of files) hash.update(`${f.path}\0${byId.get(f.id)!.sha256}\0${f.png ? "png" : ""}`);
  const etag = `"${hash.digest("base64url").slice(0, 32)}"`;
  const date = b.publishedAt ? new Date(b.publishedAt) : undefined;

  const build = async () => {
    const got: (Entry | undefined)[] = [];
    await pool([...files.keys()], 4, async (i) => {
      const f = files[i];
      const a = byId.get(f.id)!;
      if (!f.png) return void (got[i] = { name: f.path, data: new Uint8Array(await getObject(originalKey(a.sha256))) });
      // A drawing that fails leaves its PNG out: the SVG beside it is the mark.
      const png = await renderAsset(a, PNG).catch(() => null);
      if (png) got[i] = { name: f.path, data: new Uint8Array(await new Response(png.body).arrayBuffer()) };
    });
    return zip([...texts, ...got.filter((e): e is Entry => !!e)].map((e) => ({ ...e, date })));
  };

  return {
    etag,
    filename: `${b.brand}-${b.version}-press-kit.zip`,
    /** The zip. Throws rate_limited when too many kits are being built. */
    bytes() {
      let job = inFlight.get(etag);
      if (!job) {
        if (building.full) throw new AssetError("rate_limited", "Busy making press kits: try again in a moment");
        job = building.run(1, build).finally(() => inFlight.delete(etag));
        inFlight.set(etag, job);
      }
      return job;
    },
  };
}
