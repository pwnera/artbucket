/**
 * Fill a running Artbucket with Blender Foundation open movie artwork from
 * Wikimedia Commons: posters, stills, concept art and behind-the-scenes shots,
 * all CC BY or CC0. Credit and license are read from Commons at run time.
 *
 *   pnpm seed:demo                      # against http://localhost:3000
 *   APP_URL=https://demo.example pnpm seed:demo
 *
 * Safe to re-run: fields and collections are reused by key and name, and
 * identical bytes dedupe on upload.
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

const all = FILMS.flatMap((f) => f.items.map((i) => i[0]));
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
console.log(`Done: ${added} new, ${all.length - added} already there.`);

export {};
