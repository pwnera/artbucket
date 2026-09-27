/**
 * Fill a running Artbucket with Blender Foundation open movie artwork from
 * Wikimedia Commons: posters, stills, concept art and behind-the-scenes shots,
 * all CC BY or CC0. Credit and license are read from Commons at run time.
 * Then a Blender brand, from the colors and logo rules on blender.org/about/logo.
 *
 *   pnpm seed:demo                      # against http://localhost:3000
 *   APP_URL=https://demo.example pnpm seed:demo
 *
 * Safe to re-run: fields and collections are reused by key and name,
 * identical bytes dedupe on upload, and existing brand rules are left as they are.
 */

const APP = process.env.APP_URL ?? "http://localhost:3000";
const UA = "artbucket-seed-demo/0.1 (https://github.com/pwnera/artbucket)";

type Kind = "Poster" | "Still" | "Concept art" | "Behind the scenes";
type Item = [file: string, kind: Kind, tags: string[]];
type Film = { name: string; year: number; items: Item[] };

const FILMS: Film[] = [
  {
    name: "Elephants Dream",
    year: 2006,
    items: [
      ["Blender3D ProogWithoutTextures.jpg", "Behind the scenes", ["proog", "character", "untextured"]],
      ["Blender3D ProogWithBumpColSpec.jpg", "Behind the scenes", ["proog", "character", "textured"]],
    ],
  },
  {
    name: "Big Buck Bunny",
    year: 2008,
    items: [
      ["Big buck bunny poster big.jpg", "Poster", ["bunny", "key art"]],
      ["Peach Bunny Poster.jpg", "Poster", ["bunny", "key art"]],
      ["Peach poster rodents.jpg", "Poster", ["frank", "rinky", "gimera", "villains"]],
      ["Bbb-splash.png", "Still", ["bunny", "title card"]],
      ["BBB-Bunny.png", "Still", ["bunny", "character"]],
      ["Big.Buck.Bunny.-.Bunny.Portrait.png", "Still", ["bunny", "portrait"]],
      ["Big.Buck.Bunny.-.Frank.png", "Still", ["frank", "character"]],
      ["Evil-frank.png", "Still", ["frank", "villains"]],
      ["Big.Buck.Bunny.-.Ricky.png", "Still", ["rinky", "character"]],
      ["Big.Buck.Bunny.-.Landscape.png", "Still", ["landscape", "meadow"]],
      ["Big.Buck.Bunny.-.Opening.Screen.png", "Still", ["landscape", "opening"]],
      ["Big Buck Bunny - forest.jpg", "Still", ["landscape", "forest"]],
      ["Peach-sketch1.jpg", "Concept art", ["sketch", "bunny"]],
      ["Peach-sketch2.jpg", "Concept art", ["sketch"]],
      ["Peach-sketch3.jpg", "Concept art", ["sketch"]],
      ["Peach Rinkysplash.jpg", "Concept art", ["rinky"]],
      ["PeachBlender.jpg", "Behind the scenes", ["blender", "layout"]],
      ["Blender-BBB.png", "Behind the scenes", ["blender", "bunny"]],
    ],
  },
  {
    name: "Sintel",
    year: 2010,
    items: [
      ["Sintel poster.jpg", "Poster", ["sintel", "key art", "dragon"]],
      ["Sintel Poster Paintover clean.jpg", "Concept art", ["sintel", "paintover"]],
    ],
  },
  {
    name: "Tears of Steel",
    year: 2012,
    items: [
      ["Tos-poster.png", "Poster", ["key art", "sci-fi", "robots"]],
      ["Blendertof3.jpg", "Behind the scenes", ["blender", "vfx"]],
    ],
  },
  {
    name: "Cosmos Laundromat",
    year: 2015,
    items: [
      ["CosmosLaundromatPoster.jpg", "Poster", ["franck", "key art"]],
      ["Cosmos Laundromat Victor Poster.jpg", "Poster", ["victor", "key art"]],
      ["CosmosLaundromatYouTubeThumbnail.jpg", "Still", ["franck", "thumbnail"]],
      ["CosmosLaundromatFranck.jpg", "Still", ["franck", "sheep", "character"]],
      ["CosmosLaundromatVictor.jpg", "Still", ["victor", "character"]],
      ["Franck the caterpillar.jpg", "Still", ["franck", "caterpillar"]],
      ["Tornado deevad 01.jpg", "Concept art", ["david revoy", "tornado"]],
    ],
  },
  {
    name: "Spring",
    year: 2019,
    items: [
      ["Spring2019AlphaPosterBlender.jpg", "Poster", ["spring", "key art"]],
      ["Spring2019PillarPosterBlender.jpg", "Poster", ["spring", "key art", "mountains"]],
      ["Blender Open Movie - Spring (2019).png", "Still", ["spring", "dog", "mountains"]],
      ["Blender Foundation - Spring - Closing title card.jpg", "Still", ["title card"]],
    ],
  },
];

const KINDS: Kind[] = ["Poster", "Still", "Concept art", "Behind the scenes"];
const ALLOWED = /^(CC BY \d\.\d|CC0|Public domain)$/;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(APP + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Info = { url: string; mime: string; license: string; artist: string; description: string };

/** Direct URL, license and credit for up to 50 Commons files per call. */
async function commons(files: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>();
  for (let i = 0; i < files.length; i += 50) {
    const qs = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription",
      titles: files.slice(i, i + 50).map((f) => "File:" + f).join("|"),
    });
    const res = await fetch("https://commons.wikimedia.org/w/api.php?" + qs, { headers: { "user-agent": UA } });
    const { query } = (await res.json()) as {
      query: {
        normalized?: { from: string; to: string }[];
        pages: { title: string; imageinfo?: { url: string; mime: string; extmetadata: Record<string, { value: string }> }[] }[];
      };
    };
    const back = new Map((query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of query.pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata;
      out.set((back.get(p.title) ?? p.title).replace(/^File:/, ""), {
        url: ii.url,
        mime: ii.mime,
        license: m.LicenseShortName?.value ?? "",
        artist: text(m.Artist?.value),
        description: text(m.ImageDescription?.value),
      });
    }
  }
  return out;
}

/** Commons metadata is HTML; keep the words. */
const text = (html = "") =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

async function ensureFields(licenses: string[]) {
  const { data } = await api<{ data: { key: string; options: string[] }[] }>("GET", "/api/v1/fields");
  const have = new Map(data.map((f) => [f.key, f]));
  const want = [
    { key: "film", label: "Film", type: "select", options: FILMS.map((f) => f.name), position: 0 },
    { key: "year", label: "Year", type: "number", options: [], position: 1 },
    { key: "kind", label: "Kind", type: "select", options: KINDS, position: 2 },
    { key: "license", label: "License", type: "select", options: licenses, position: 3 },
  ];
  for (const f of want) {
    const cur = have.get(f.key);
    if (!cur) await api("POST", "/api/v1/fields", f);
    else if (f.options.some((o) => !cur.options.includes(o)))
      await api("PATCH", `/api/v1/fields/${f.key}`, { options: [...new Set([...cur.options, ...f.options])] });
  }
}

async function ensureCollection(film: Film): Promise<string> {
  const { data } = await api<{ data: { id: string; name: string }[] }>("GET", "/api/v1/collections");
  const fields = { film: film.name, year: film.year };
  const found = data.find((c) => c.name === film.name);
  if (found) {
    await api("PATCH", `/api/v1/collections/${found.id}`, { icon: "movie", fields });
    return found.id;
  }
  const { data: made } = await api<{ data: { id: string } }>("POST", "/api/v1/collections", {
    name: film.name,
    icon: "movie",
    fields,
  });
  return made.id;
}

async function upload(file: string, info: Info) {
  let res = await fetch(info.url, { headers: { "user-agent": UA } });
  // Commons upload servers rate-limit bursts; back off and retry.
  for (let wait = 2; res.status === 429 && wait <= 64; wait *= 2) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || wait) * 1000));
    res = await fetch(info.url, { headers: { "user-agent": UA } });
  }
  if (!res.ok) throw new Error(`download ${file}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { token, uploadUrl } = await api<{ token: string; uploadUrl: string }>("POST", "/api/v1/uploads", {
    filename: file,
    mime: info.mime,
    size: bytes.byteLength,
  });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": info.mime }, body: bytes });
  if (!put.ok) throw new Error(`PUT ${file}: ${put.status}`);
  return token;
}

/** Blender's logos on Commons: public domain, trademarks of the Blender Foundation. */
const LOGOS = { mark: "Blender logo no text.svg", wordmark: "Logo Blender.svg" };

const all = [...FILMS.flatMap((f) => f.items.map((i) => i[0])), ...Object.values(LOGOS)];
const infos = await commons(all);
const missing = all.filter((f) => !infos.has(f));
if (missing.length) throw new Error(`Not on Commons: ${missing.join(", ")}`);
const refused = all.filter((f) => !ALLOWED.test(infos.get(f)!.license));
if (refused.length) throw new Error(`Unexpected license: ${refused.map((f) => `${f} (${infos.get(f)!.license})`).join(", ")}`);

await ensureFields([...new Set([...infos.values()].map((i) => i.license))].sort());

let added = 0;
for (const film of FILMS) {
  const collection = await ensureCollection(film);
  for (const [file, kind, tags] of film.items) {
    const info = infos.get(file)!;
    const token = await upload(file, info);
    const { data, deduped } = await api<{ data: { id: string }; deduped: boolean }>("POST", "/api/v1/assets", {
      token,
      filename: file,
      mime: info.mime,
      fields: { kind, license: info.license },
      collections: [collection],
    });
    await api("PATCH", `/api/v1/assets/${data.id}`, {
      tags: ["blender open movie", ...tags],
      title: file.replace(/\.\w+$/, "").replace(/[._]/g, " "),
      description: info.description || null,
      creator: info.artist || "Blender Foundation",
      copyright: `${info.artist || "Blender Foundation"}, ${info.license}. Source: https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`,
    });
    if (!deduped) added++;
    console.log(`${deduped ? "=" : "+"} ${film.name} / ${file}`);
  }
}
const logos: Record<string, string> = {};
for (const [name, file] of Object.entries(LOGOS)) {
  const info = infos.get(file)!;
  const token = await upload(file, info);
  const { data, deduped } = await api<{ data: { id: string }; deduped: boolean }>("POST", "/api/v1/assets", {
    token,
    filename: file,
    mime: info.mime,
    fields: { license: info.license },
  });
  await api("PATCH", `/api/v1/assets/${data.id}`, {
    tags: ["blender", "logo"],
    title: name === "mark" ? "Blender logo mark" : "Blender logo with wordmark",
    creator: "Blender Foundation",
    copyright: `Trademark of the Blender Foundation, ${info.license}. Source: https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`,
  });
  logos[name] = data.id;
  if (!deduped) added++;
  console.log(`${deduped ? "=" : "+"} Blender brand / ${file}`);
}
console.log(`Done: ${added} new, ${all.length - added} already there.`);

/** A 409 means it is already there: keep it, so re-runs never undo edits. */
const created = (p: Promise<unknown>) =>
  p.then(
    () => true,
    (e: Error) => {
      if (/: 409 /.test(e.message)) return false;
      throw e;
    },
  );

const RULES = [
  { key: "brand.mission", type: "text", value: "Blender is the free and open source 3D creation suite. **The freedom to create.**", usage: "The one line that says what Blender is. Lead with it in intros and about pages." },
  { key: "color.primary", type: "color", value: "#e87d0d", usage: "Blender orange (PMS 716). The logo's circle and the brand's accent: links, highlights, calls to action." },
  { key: "color.secondary", type: "color", value: "#265787", usage: "Blender blue (PMS 647). The logo's inner dot and headings on light backgrounds." },
  { key: "color.background", type: "color", value: "#ffffff", usage: "White. The logo's third color and the default page background." },
  { key: "color.background", context: "dark-background", type: "color", value: "#1d1d1d", usage: "Near black, as in the Blender interface. Keep the logo in its original colors on it." },
  { key: "type.primary", type: "font", value: { family: "Inter", weight: 400 }, usage: "The Blender interface face since 4.0. Available on Google Fonts." },
  { key: "type.heading", type: "font", value: { family: "Inter", size: 32, weight: 700 }, usage: "Headings. One weight step up is enough; no italics." },
  { key: "type.scale", type: "list", value: [12, 14, 16, 20, 24, 32, 48], usage: "Pixels. Pick from the scale, nothing between steps." },
  { key: "logo.mark", type: "text", value: "The Blender mark: the orange circle and blue dot, no text.", usage: "App icons, avatars, favicons and anywhere the name is already on screen.", assets: [logos.mark] },
  { key: "logo.wordmark", type: "text", value: "The mark with the Blender wordmark.", usage: "The default logo. Use it when pointing to Blender or giving credit, linked to blender.org.", assets: [logos.wordmark] },
  { key: "logo.always", type: "list", value: ["Use it only to point to Blender or to give credit", "Link it to blender.org on the web", "Keep its original colors and typography", "Pair it with text or other logos in credits"] },
  { key: "logo.neverDo", type: "list", value: ["Use it as your own logo", "Modify or enhance it", "Show it alone in credits", "Put it on commercial products without permission"] },
  { key: "tone.always", type: "list", value: ["Plain words", "Credit the community", "Say free and open source"] },
  { key: "tone.avoid", type: "list", value: ["Hype", "Exclamation marks", "Em dashes"] },
];

const made = await created(api("POST", "/api/v1/brands", { name: "Blender" }));
let rules = 0;
for (const r of RULES) if (await created(api("POST", "/api/v1/brand/rules?brand=blender", r))) rules++;
console.log(`Blender brand: ${made ? "created" : "already there"}, ${rules} new rules, ${RULES.length - rules} already there.`);

export {};
