import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fontFiles,
  fontFileName,
  fontMime,
  fontStyle,
  GOOGLE_FAMILY,
  googleFontsCss,
  isFont,
  isFontAsset,
  parseCatalog,
  parseFontFaces,
  pickFace,
  searchCatalog,
} from "./font.ts";

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

test("sniffs each font format from its signature", () => {
  assert.equal(fontMime(bytes("wOF2rest")), "font/woff2");
  assert.equal(fontMime(bytes("wOFFrest")), "font/woff");
  assert.equal(fontMime(bytes("OTTOrest")), "font/otf");
  assert.equal(fontMime(new Uint8Array([0, 1, 0, 0, 9])), "font/ttf");
  assert.equal(fontMime(bytes("true")), "font/ttf");
});

test("anything else is not a font", () => {
  assert.equal(fontMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(fontMime(new Uint8Array([])), null);
});

test("a font by mime, or by extension when stored before sniffing", () => {
  assert.ok(isFont("font/woff2", "x.bin"));
  assert.ok(isFont("application/octet-stream", "Inter-Bold.TTF"));
  assert.ok(!isFont("image/png", "logo.png"));
});

test("asks Google for every style slot of the family", () => {
  const url = new URL(googleFontsCss(" Playfair  Display "));
  assert.equal(url.host, "fonts.googleapis.com");
  assert.ok(url.search.startsWith("?family=Playfair+Display:ital,wght@0,100;"), url.search);
  assert.ok(url.search.endsWith(";1,900"));
  assert.ok(GOOGLE_FAMILY.test("Playfair Display") && !GOOGLE_FAMILY.test("Inter&x=1") && !GOOGLE_FAMILY.test(""));
});

test("reads the faces out of a css2 response, roman first, gstatic files only", () => {
  const css = `
/* comment */
@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/inter/v20/a.ttf) format('truetype');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/inter/v20/b.ttf) format('truetype');
}
@font-face {
  font-family: 'Evil';
  font-style: normal;
  font-weight: 400;
  src: url(https://evil.example/x.ttf) format('truetype');
}`;
  assert.deepEqual(parseFontFaces(css), [
    { style: "normal", weight: 400, url: "https://fonts.gstatic.com/s/inter/v20/b.ttf" },
    { style: "italic", weight: 700, url: "https://fonts.gstatic.com/s/inter/v20/a.ttf" },
  ]);
});

test("names files the way families ship them", () => {
  assert.equal(fontFileName("Playfair Display", { weight: 700, style: "italic" }), "PlayfairDisplay-BoldItalic.ttf");
  assert.equal(fontFileName("Inter", { weight: 400, style: "normal" }), "Inter-Regular.ttf");
  assert.equal(fontFileName("Inter", { weight: 400, style: "italic" }), "Inter-Italic.ttf");
});

test("reads the catalog, past its XSSI guard", () => {
  const raw = `)]}'{"familyMetadataList":[{"family":"Inter","category":"Sans Serif","fonts":{"400":{},"700i":{}},"popularity":3,"extra":1}]}`;
  assert.deepEqual(parseCatalog(raw), [{ family: "Inter", category: "Sans Serif", styles: ["400", "700i"], popularity: 3 }]);
});

test("search puts prefix matches first, then popularity", () => {
  const f = (family: string, popularity: number, category = "Serif") => ({ family, category, styles: ["400"], popularity });
  const list = [f("Noto Sans Mono", 1, "Monospace"), f("Monoton", 50, "Display"), f("Roboto Mono", 2, "Monospace"), f("Inter", 0)];
  assert.deepEqual(
    searchCatalog(list, { q: "MONO" }).map((x) => x.family),
    ["Monoton", "Noto Sans Mono", "Roboto Mono"],
  );
  assert.deepEqual(searchCatalog(list, { q: "mono", category: "Monospace" }).map((x) => x.family), ["Noto Sans Mono", "Roboto Mono"]);
  assert.equal(searchCatalog(list, {})[0].family, "Inter");
});

test("reads a style back from its file name", () => {
  assert.deepEqual(fontStyle("Inter-SemiBoldItalic.ttf"), { weight: 600, italic: true, label: "Semi Bold Italic" });
  assert.deepEqual(fontStyle("Inter-Italic.ttf"), { weight: 400, italic: true, label: "Italic" });
  assert.deepEqual(fontStyle("PlayfairDisplay-ExtraLight.ttf"), { weight: 200, italic: false, label: "Extra Light" });
  assert.deepEqual(fontStyle("Geist-Variable.woff2"), { weight: 400, italic: false, label: "Variable" });
  for (const w of [100, 400, 700, 900])
    for (const style of ["normal", "italic"] as const) {
      const back = fontStyle(fontFileName("IBM Plex Sans", { weight: w, style }));
      assert.equal(back.weight, w);
      assert.equal(back.italic, style === "italic");
    }
});

test("picks the upright file at a weight, else the Regular", () => {
  const files = ["X-Italic.ttf", "X-Bold.ttf", "X-BoldItalic.ttf", "X-Regular.ttf"].map((filename) => ({ filename }));
  assert.equal(pickFace(files, 700)?.filename, "X-Bold.ttf");
  assert.equal(pickFace(files, 300)?.filename, "X-Regular.ttf");
  assert.equal(pickFace(files)?.filename, "X-Regular.ttf");
  assert.equal(pickFace([{ filename: "X-Italic.ttf" }])?.filename, "X-Italic.ttf");
  assert.equal(pickFace([]), undefined);
});

test("a rule's font files are its font assets, in order, stored mime or not", () => {
  const assets = [
    { id: "a", mime: "image/svg+xml", filename: "logo.svg" },
    { id: "b", mime: "font/ttf", filename: "Inter-Bold.ttf" },
    { id: "c", mime: "application/octet-stream", filename: "Inter-Regular.woff2" },
    { id: "d", filename: "Inter-Italic.ttf" },
  ];
  assert.deepEqual(fontFiles({ assets }).map((a) => a.id), ["b", "c"]);
  assert.equal(isFontAsset({ mime: null, filename: "x.ttf" }), false, "no mime yet: not known to be a font");
});
