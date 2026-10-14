import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { ingestBytes, updateAsset } from "@/lib/core/assets";
import { publishBrand, setRules } from "@/lib/core/brand";
import { setHub } from "@/lib/core/brands";
import { hubBrand } from "@/lib/core/hub";
import { reader } from "@/lib/core/portals";
import { pressKit } from "@/lib/core/press-kit";
import { env } from "@/lib/env";
import { unzip } from "@/lib/zip";

// A server that runs BrandHub: env is read as the app loads, so it is set on it.
env.HUB_URL ??= "http://localhost:3000/hub";

const svg = (fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="${fill}"/></svg>`);
const names = async (bytes: Uint8Array) => unzip(bytes).map((e) => e.name).sort();
const text = async (bytes: Uint8Array, name: string) => new TextDecoder().decode(await unzip(bytes).find((e) => e.name === name)!.read());

/** Ada's default brand, released with a logo, a dark version, a mark kept from outside, an archived one, two typefaces and a don't. */
async function released(name: string) {
  const { caller, cookie } = await signUp(name);
  const up = (bytes: Buffer, filename: string, mime: string, rights?: Record<string, unknown>) =>
    ingestBytes(caller, { bytes, mime, filename, ...(rights && { rights: { license: null, territories: [], channels: [], embargo: null, expires: null, modelRelease: null, downloadable: null, ...rights } }) }).then((r) => r.asset);
  const logo = await up(svg("#e11d48"), "logo.svg", "image/svg+xml");
  const dark = await up(svg("#ffffff"), "logo-white.svg", "image/svg+xml");
  const licensed = await up(svg("#111111"), "agency-mark.svg", "image/svg+xml", { downloadable: false });
  const gone = await up(svg("#222222"), "old-mark.svg", "image/svg+xml");
  const open = await up(Buffer.from("not really a font, open"), "Acme-Bold.woff2", "font/woff2", { license: "SIL Open Font License 1.1" });
  const foundry = await up(Buffer.from("not really a font, foundry"), "Foundry-Regular.woff2", "font/woff2", { license: "Foundry desktop license" });
  await setRules(caller, undefined, {
    set: [
      { key: "color.primary", type: "color", value: "#e11d48", label: "Acme red", usage: "Buttons and links" },
      { key: "logo.primary", type: "text", value: "The logo", label: "The logo", usage: "On white, with room around it", assets: [{ id: logo.id, rendition: null }] },
      { key: "logo.primary", type: "text", value: "The logo", context: "dark-background", assets: [{ id: dark.id, rendition: null }] },
      { key: "logo.mark", type: "text", value: "The mark", assets: [{ id: licensed.id, rendition: null }, { id: gone.id, rendition: null }] },
      { key: "type.heading", type: "font", value: { family: "Acme Sans", weight: 700 }, assets: [{ id: open.id, rendition: null }] },
      { key: "type.body", type: "font", value: { family: "Foundry" }, assets: [{ id: foundry.id, rendition: null }] },
      { key: "logo.neverDo", type: "list", value: ["Stretch it"] },
    ],
  } as unknown as Parameters<typeof setRules>[2]);
  await updateAsset(caller, gone.id, { status: "archived" });
  await publishBrand(caller, undefined, { note: "From acme.example's press page." });
  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, caller.project.organizationId));
  return { caller, cookie, org: org.slug };
}

test("a public listing's press kit: its logos with PNGs, palette, tokens, the fonts it may pass on, a README; nothing kept or archived", async () => {
  const { caller, org } = await released("Ada");
  await setHub(caller, "default", { visibility: "public" });
  const b = await hubBrand(org, "default");
  assert.ok(b, "anyone reads a public listing");
  const kit = await pressKit(b);
  const zip = await kit.bytes();
  assert.equal(kit.filename, `default-${b.version}-press-kit.zip`);
  assert.deepEqual(await names(zip), [
    "README.md",
    "colors.ase",
    "colors.txt",
    "fonts/Acme Sans/Acme-Bold.woff2",
    "logos/The logo (Dark background)/logo-white.png",
    "logos/The logo (Dark background)/logo-white.svg",
    "logos/The logo/logo.png",
    "logos/The logo/logo.svg",
    "tokens.css",
    "tokens.json",
  ]);
  const png = await unzip(zip).find((e) => e.name === "logos/The logo/logo.png")!.read();
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.match(await text(zip, "colors.txt"), /Acme red\n {2}HEX {2}#E11D48\n {2}RGB {2}225 29 72/);
  // The open font loads from the kit; the foundry one isn't in it, nor in the tokens' @font-face.
  const css = await text(zip, "tokens.css");
  assert.match(css, /url\("fonts\/Acme Sans\/Acme-Bold\.woff2"\)/);
  assert.doesNotMatch(css, /\/a\//);
  const readme = await text(zip, "README.md");
  assert.match(readme, new RegExp(`release @${b.version} of \\d{4}-\\d{2}-\\d{2}`));
  assert.match(readme, /may not come from Default's owner/);
  assert.match(readme, /From acme\.example's press page\./);
  assert.match(readme, /Foundry desktop license\. Its files aren't in the kit/);
  assert.match(readme, /SIL Open Font License 1\.1\. Its files are in `fonts\/`/);
  assert.match(readme, /- Don't: Stretch it/);
  assert.match(readme, /logos\/Mark\/agency-mark\.svg/);
  assert.doesNotMatch(readme, /old-mark/);
  // The same release, the same kit: a client holding it is told so.
  assert.equal((await pressKit((await hubBrand(org, "default"))!)).etag, kit.etag);
});

test("a private listing's press kit is its people's only", async () => {
  const { cookie, org } = await released("Grace");
  assert.equal(await hubBrand(org, "default"), null, "nobody in particular doesn't see it");
  const stranger = await reader(new Headers({ cookie: (await signUp("Mallory")).cookie }));
  assert.equal(await hubBrand(org, "default", { viewer: stranger }), null, "someone of another organization doesn't either");
  const b = await hubBrand(org, "default", { viewer: await reader(new Headers({ cookie })) });
  assert.equal(b?.visibility, "private");
  assert.ok((await names(await (await pressKit(b!)).bytes())).includes("logos/The logo/logo.svg"));
});
