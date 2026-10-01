/**
 * Fill a running Artbucket with Blender Foundation open movie artwork from
 * Wikimedia Commons: posters, stills, concept art and behind-the-scenes shots,
 * all CC BY or CC0. Credit and license are read from Commons at run time.
 * Then a Blender brand, from the colors and logo rules on blender.org/about/logo.
 * Then files that aren't images, to see every preview at work: the films'
 * trailers, a PDF poster, a production PSD and a soundtrack, and in a "File
 * formats" collection real AI, EPS, HEIC, Sketch, XD, Keynote, Word, Excel,
 * PowerPoint, Figma, Lottie and After Effects files from open-source
 * repositories, and public Google Docs and Slides kept as links.
 *
 *   pnpm seed:demo                      # against http://localhost:3000
 *   APP_URL=https://demo.example pnpm seed:demo
 *   ARTBUCKET_KEY=ab_... pnpm seed:demo # a write key, from Agents
 *
 * Safe to re-run: fields and collections are reused by key and name,
 * identical bytes dedupe on upload, and existing brand rules are left as they are.
 */

import { unzip } from "../src/lib/zip.ts";

const APP = process.env.APP_URL ?? "http://localhost:3000";
if (!process.env.ARTBUCKET_KEY) {
  console.error("Set ARTBUCKET_KEY to a write key: make one on the Agents page after making the first account.");
  process.exit(1);
}
/** A write key: the library is closed to requests without one. */
const KEY = process.env.ARTBUCKET_KEY;
const UA = "artbucket-seed-demo/0.1 (https://github.com/pwnera/artbucket)";

type Kind = "Poster" | "Still" | "Concept art" | "Behind the scenes" | "Trailer" | "Soundtrack";
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

const KINDS: Kind[] = ["Poster", "Still", "Concept art", "Behind the scenes", "Trailer", "Soundtrack"];
const ALLOWED = /^(CC BY \d\.\d|CC0|Public domain)$/;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(APP + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Rate limited: wait as long as the server says, then ask again.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get("retry-after") || 5)));
    return api(method, path, body);
  }
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

async function ensureCollection(name: string, icon: string, fields: Record<string, unknown> = {}): Promise<string> {
  const { data } = await api<{ data: { id: string; name: string }[] }>("GET", "/api/v1/collections");
  const found = data.find((c) => c.name === name);
  if (found) {
    await api("PATCH", `/api/v1/collections/${found.id}`, { icon, fields });
    return found.id;
  }
  const { data: made } = await api<{ data: { id: string } }>("POST", "/api/v1/collections", { name, icon, fields });
  return made.id;
}

/** Download, from inside a zip when `entry` names a file in it, and stage for upload. */
async function upload(file: string, info: Pick<Info, "url" | "mime">, entry?: string) {
  let res = await fetch(info.url, { headers: { "user-agent": UA } });
  // Commons upload servers rate-limit bursts; back off and retry.
  for (let wait = 2; res.status === 429 && wait <= 64; wait *= 2) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || wait) * 1000));
    res = await fetch(info.url, { headers: { "user-agent": UA } });
  }
  if (!res.ok) throw new Error(`download ${file}: ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (entry) {
    const found = unzip(bytes).find((e) => e.name === entry);
    if (!found) throw new Error(`${entry} is not in ${info.url}`);
    // A file the script picked, from a zip it trusts: as large as it is.
    bytes = await found.read(found.size);
  }
  const { token, uploadUrl } = await api<{ token: string; uploadUrl: string }>("POST", "/api/v1/uploads", {
    filename: file,
    mime: info.mime,
    size: bytes.byteLength,
  });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": info.mime }, body: bytes });
  if (!put.ok) throw new Error(`PUT ${file}: ${put.status}`);
  return token;
}

type Extra = {
  film: string;
  kind: Kind;
  file: string;
  url: string;
  mime: string;
  /** A file inside the zip at `url`. */
  entry?: string;
  title: string;
  creator: string;
  license: string;
  source: string;
  tags: string[];
};

/** The films beyond stills: trailers (Commons' transcodes), and print and sound from download.blender.org. */
const ED = "https://download.blender.org/ED";
const EXTRAS: Extra[] = [
  {
    film: "Sintel",
    kind: "Trailer",
    file: "Sintel trailer.webm",
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/0/06/Sintel_trailer-1080p.ogv/Sintel_trailer-1080p.ogv.480p.vp9.webm",
    mime: "video/webm",
    title: "Sintel trailer",
    creator: "Blender Foundation, Durian Open Movie Project",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Sintel_trailer-1080p.ogv",
    tags: ["sintel", "trailer"],
  },
  {
    film: "Big Buck Bunny",
    kind: "Trailer",
    file: "Big Buck Bunny trailer.mov",
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b3/Big_Buck_Bunny_Trailer_400p.ogv/Big_Buck_Bunny_Trailer_400p.ogv.360p.mpeg4.mov",
    mime: "video/quicktime",
    title: "Big Buck Bunny trailer",
    creator: "Blender Foundation",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_Trailer_400p.ogv",
    tags: ["bunny", "trailer"],
  },
  {
    // Filed under Elephants Dream on the server, but it is Big Buck Bunny's.
    film: "Big Buck Bunny",
    kind: "Poster",
    file: "Big Buck Bunny poster.pdf",
    url: `${ED}/poster.pdf`,
    mime: "application/pdf",
    title: "Big Buck Bunny poster (print)",
    creator: "Blender Foundation",
    license: "CC BY 3.0",
    source: `${ED}/poster.pdf`,
    tags: ["bunny", "key art", "print"],
  },
  {
    film: "Elephants Dream",
    kind: "Poster",
    file: "3DW80cover.psd",
    url: `${ED}/3DW80cover.zip`,
    entry: "3DW80cover.psd",
    mime: "image/vnd.adobe.photoshop",
    title: "3D World issue 80 cover",
    creator: "Blender Foundation, Orange Open Movie Project",
    license: "CC BY 2.5",
    source: `${ED}/`,
    tags: ["proog", "emo", "print", "magazine"],
  },
  {
    film: "Elephants Dream",
    kind: "Soundtrack",
    file: "Elephants Dream teaser music.mp3",
    url: `${ED}/6-TeaserMusic.mp3`,
    mime: "audio/mpeg",
    title: "Teaser music",
    creator: "Jan Morgenstern",
    license: "CC BY 2.5",
    source: `${ED}/`,
    tags: ["music", "teaser"],
  },
];

type Format = Omit<Extra, "film" | "kind" | "entry" | "license"> & { license: string | null };

/** GitHub files at a fixed commit, so a moved file never breaks the seed. */
const gh = (repo: string, commit: string, path: string) => ({
  url: `https://raw.githubusercontent.com/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`,
  source: `https://github.com/${repo}/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`,
});

/**
 * One real file per type the previews handle (lib/core/previews.ts), and two
 * that show as their type only (.aep, and a .fig in Figma's older format).
 */
const FORMATS: Format[] = [
  {
    file: "cni-stacked-color.ai",
    ...gh("cncf/artwork", "831f27a0cf4227b1b76a28ff51a9f4127a2195ec", "projects/cni/stacked/color/cni-stacked-color.ai"),
    mime: "application/postscript",
    title: "CNI logo (Illustrator)",
    creator: "Cloud Native Computing Foundation",
    license: "Linux Foundation trademark policy",
    tags: ["logo", "illustrator"],
  },
  {
    file: "kai-scheduler-horizontal-black.eps",
    ...gh("cncf/artwork", "831f27a0cf4227b1b76a28ff51a9f4127a2195ec", "projects/kai-scheduler/horizontal/print/kai-scheduler-horizontal-black.eps"),
    mime: "application/postscript",
    title: "KAI Scheduler logo (EPS)",
    creator: "Cloud Native Computing Foundation",
    license: "Linux Foundation trademark policy",
    tags: ["logo", "eps", "print"],
  },
  {
    file: "example.heic",
    ...gh("strukturag/libheif", "5c7b41f3cc097447dd3c700cc9ec7d94fbb59eec", "examples/example.heic"),
    mime: "image/heic",
    title: "libheif example photo (HEIC)",
    creator: "struktur AG",
    license: null,
    tags: ["photo", "heic"],
  },
  {
    file: "with-color-variables.sketch",
    ...gh("sketch-hq/sketch-document", "4493900abbfa49ae82fbcb8ad85cccf2cc2256b0", "packages/file/src/__tests__/with-color-variables.sketch"),
    mime: "application/octet-stream",
    title: "Sketch document",
    creator: "Sketch B.V.",
    license: "MIT",
    tags: ["sketch", "design file"],
  },
  {
    file: "banner.xd",
    ...gh("AdobeXD/plugin-samples", "263538bdecd88f6a25dfe1e01806eba7ed6f3ff6", "e2e-customize-banner/banner.xd"),
    mime: "application/octet-stream",
    title: "Banner (Adobe XD)",
    creator: "Adobe",
    license: "Apache-2.0",
    tags: ["xd", "design file", "banner"],
  },
  {
    file: "UX Clinic.key",
    ...gh("opensourcedesign/opensourcedesign.github.io", "0f3e0ead0d31268881ecbe3642fb90a64ffc7f9e", "presentations/UX Clinic.key"),
    mime: "application/x-iwork-keynote-sffkey",
    title: "UX Clinic (Keynote)",
    creator: "Open Source Design",
    license: "MIT",
    tags: ["keynote", "presentation"],
  },
  {
    file: "cht-axis-props.pptx",
    ...gh("scanny/python-pptx", "278b47b1dedd5b46ee84c286e77cdfb0bf4594be", "features/steps/test_files/cht-axis-props.pptx"),
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    title: "Chart deck (PowerPoint)",
    creator: "python-pptx",
    license: "MIT",
    tags: ["powerpoint", "presentation"],
  },
  {
    file: "par-known-paragraphs.docx",
    ...gh("python-openxml/python-docx", "e45454602b53e8e572b179ccf1c91093ec9f4ed7", "features/steps/test_files/par-known-paragraphs.docx"),
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    title: "Paragraphs (Word)",
    creator: "python-docx",
    license: "MIT",
    tags: ["word", "document"],
  },
  {
    file: "images.xlsx",
    ...gh("exceljs/exceljs", "5bed18b45e824f409b08456b59b87430ded023ab", "spec/integration/data/images.xlsx"),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    title: "Images (Excel, previews with LibreOffice)",
    creator: "ExcelJS",
    license: "MIT",
    tags: ["excel", "spreadsheet"],
  },
  {
    file: "blue-circle.fig",
    ...gh("darknoon/figma-format-parse", "3fda92f1f6fd76f41ef7b45ef4fa32c6c9abca85", "packages/fig-kiwi/data/blue-circle.fig"),
    mime: "application/octet-stream",
    title: "Blue circle (Figma, older format: no preview)",
    creator: "darknoon",
    license: null,
    tags: ["figma", "design file"],
  },
  {
    file: "hamster.lottie",
    ...gh("LottieFiles/dotlottie-web", "a08deda3ba399203c9c155fa29a55cfa35eb4946", "fixtures/hamster.lottie"),
    mime: "application/octet-stream",
    title: "Hamster (dotLottie)",
    creator: "LottieFiles",
    license: "MIT",
    tags: ["lottie", "animation"],
  },
  {
    file: "LottieLogo1.json",
    ...gh("airbnb/lottie-ios", "2c8608c6b5d6e3fc62168e321fe0a7c89aaa8693", "Tests/Samples/LottieLogo1.json"),
    mime: "application/json",
    title: "Lottie logo (Lottie JSON)",
    creator: "Airbnb",
    license: "Apache-2.0",
    tags: ["lottie", "animation", "logo"],
  },
  {
    file: "helperProject.aep",
    ...gh("airbnb/lottie-web", "bede03d25d232826e0c9dca1733d542d8a7754fb", "build/old_parser/helperProject.aep"),
    mime: "application/octet-stream",
    title: "After Effects project (no preview)",
    creator: "Airbnb",
    license: "MIT",
    tags: ["after effects", "motion"],
  },
];

/** Public Google files, kept as links: they show as Google's embed, with Drive's thumbnail. */
const LINKS = [
  "https://docs.google.com/presentation/d/1OZHpP7JI5TJQlrLW7O4pwfkaRHvgolour1vXolA8I8I/edit",
  "https://docs.google.com/presentation/d/1ENjToh9oFL26d0Oqp3m9cZQCeAhxSPJRtZzMBC9hAqc/edit",
  "https://docs.google.com/document/d/1eLOg-CBEnFtpiVhiHO-RBdU_3iD2KkT0_4RLI9iqVpk/edit",
];

/** Blender's logos on Commons: public domain, trademarks of the Blender Foundation. */
const LOGOS = { mark: "Blender logo no text.svg", wordmark: "Logo Blender.svg" };

const all = [...FILMS.flatMap((f) => f.items.map((i) => i[0])), ...Object.values(LOGOS)];
const infos = await commons(all);
const missing = all.filter((f) => !infos.has(f));
if (missing.length) throw new Error(`Not on Commons: ${missing.join(", ")}`);
const refused = all.filter((f) => !ALLOWED.test(infos.get(f)!.license));
if (refused.length) throw new Error(`Unexpected license: ${refused.map((f) => `${f} (${infos.get(f)!.license})`).join(", ")}`);

await ensureFields(
  [...new Set([...infos.values(), ...EXTRAS, ...FORMATS].map((i) => i.license).filter((l): l is string => !!l))].sort(),
);

let added = 0;
for (const film of FILMS) {
  const collection = await ensureCollection(film.name, "movie", { film: film.name, year: film.year });
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
      rights: { license: info.license },
      origin: "licensed",
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
    rights: { license: `${info.license}; the Blender logo is a trademark of the Blender Foundation` },
    origin: "licensed",
  });
  logos[name] = data.id;
  if (!deduped) added++;
  console.log(`${deduped ? "=" : "+"} Blender brand / ${file}`);
}
console.log(`Done: ${added} new, ${all.length - added} already there.`);

let others = 0;
for (const x of EXTRAS) {
  const collection = await ensureCollection(x.film, "movie", { film: x.film, year: FILMS.find((f) => f.name === x.film)!.year });
  if (await addFile(x, [collection], { kind: x.kind, license: x.license }, ["blender open movie", ...x.tags])) others++;
  console.log(`  ${x.film} / ${x.file}`);
}
const formats = await ensureCollection("File formats", "archive");
for (const x of FORMATS) {
  if (await addFile(x, [formats], x.license ? { license: x.license } : {}, ["format test", ...x.tags])) others++;
  console.log(`  File formats / ${x.file}`);
}
for (const url of LINKS) {
  // Named by Google's title for it; the server keeps the link, it doesn't fetch the file.
  const { data, deduped } = await api<{ data: { id: string; filename: string }; deduped: boolean }>("POST", "/api/v1/assets", {
    url,
    collections: [formats],
  });
  await api("PATCH", `/api/v1/assets/${data.id}`, { tags: ["format test", "google", "link"] });
  if (!deduped) others++;
  console.log(`  File formats / ${data.filename}`);
}
console.log(`Other file types: ${others} new, ${EXTRAS.length + FORMATS.length + LINKS.length - others} already there.`);

/** Upload one file from the web and describe it. True when it is new. */
async function addFile(
  x: Pick<Extra, "file" | "url" | "mime" | "entry" | "title" | "creator" | "source"> & { license: string | null },
  collections: string[],
  fields: Record<string, unknown>,
  tags: string[],
) {
  const token = await upload(x.file, x, x.entry);
  const { data, deduped } = await api<{ data: { id: string }; deduped: boolean }>("POST", "/api/v1/assets", {
    token,
    filename: x.file,
    mime: x.mime,
    fields,
    collections,
  });
  await api("PATCH", `/api/v1/assets/${data.id}`, {
    tags,
    title: x.title,
    creator: x.creator,
    copyright: `${x.creator}${x.license ? `, ${x.license}` : ""}. Source: ${x.source}`,
    ...(x.license ? { rights: { license: x.license }, origin: "licensed" } : {}),
  });
  return !deduped;
}

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
