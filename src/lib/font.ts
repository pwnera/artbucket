/**
 * Fonts as assets. Browsers disagree on a font file's type (Chrome on macOS
 * sends "" for .ttf, others application/x-font-ttf), so the bytes decide.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

const SIGNATURES: [string, string][] = [
  ["wOF2", "font/woff2"],
  ["wOFF", "font/woff"],
  ["OTTO", "font/otf"],
  ["\x00\x01\x00\x00", "font/ttf"],
  ["true", "font/ttf"],
  ["ttcf", "font/collection"],
];

/** The font's mime from its first four bytes, or null when it isn't one. */
export function fontMime(bytes: Uint8Array): string | null {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  return SIGNATURES.find(([sig]) => sig === head)?.[1] ?? null;
}

/** A font asset, including ones stored before fontMime ran at upload. */
export const isFont = (mime: string, filename: string) =>
  mime.startsWith("font/") || /\.(woff2?|[ot]tf)$/i.test(filename);

type File = { mime?: string | null; filename?: string | null };
/** One of a rule's assets that is a font file. */
export const isFontAsset = (a: File) => !!a.mime && isFont(a.mime, a.filename ?? "");
/** The rule's font files, in order. */
export const fontFiles = <A extends File>(r: { assets: A[] }) => r.assets.filter(isFontAsset);

/** "Playfair Display": letters, digits and spaces, as Google Fonts names families. */
export const GOOGLE_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,79}$/;

const STYLES = [0, 1].flatMap((ital) => [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => `${ital},${w}`));

/**
 * Every style the family has. Asking for all eighteen slots is safe: Google
 * answers with the ones that exist. With no browser user agent it serves one
 * whole TTF per style, not woff2 subsets by script, which is what a library wants.
 */
export const googleFontsCss = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family.trim().replace(/ +/g, "+")}:ital,wght@${STYLES.join(";")}`;

export type GoogleFace = { style: "normal" | "italic"; weight: number; url: string };

/** The faces in a css2 response, roman before italic, lightest first. Only files on fonts.gstatic.com count. */
export function parseFontFaces(css: string): GoogleFace[] {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)]
    .flatMap(([, block]) => {
      const style = block.match(/font-style:\s*(normal|italic)/)?.[1] as GoogleFace["style"] | undefined;
      const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1]);
      const url = block.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/)?.[1];
      return style && weight && url ? [{ style, weight, url }] : [];
    })
    .sort((a, b) => Number(a.style === "italic") - Number(b.style === "italic") || a.weight - b.weight);
}

const WEIGHTS: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

/** "Playfair Display", 700, italic: "PlayfairDisplay-BoldItalic.ttf", as the family ships it. fontStyle reads it back. */
export function fontFileName(family: string, { weight, style }: Pick<GoogleFace, "weight" | "style">) {
  const name = WEIGHTS[weight] ?? String(weight);
  const suffix = style === "italic" ? (weight === 400 ? "Italic" : `${name}Italic`) : name;
  return `${family.replace(/ +/g, "")}-${suffix}.ttf`;
}

/** 600 is "Semi Bold". */
export const weightName = (w: number) => (WEIGHTS[w] ?? String(w)).replace(/([a-z])([A-Z])/g, "$1 $2");

/** "Inter-SemiBoldItalic.ttf" is SemiBold Italic, 600, italic. A name it can't read is its suffix, at 400. */
export function fontStyle(filename: string) {
  const suffix = filename.replace(/\.[^.]+$/, "").split("-").pop() ?? "";
  const italic = /italic$/i.test(suffix);
  const rest = suffix.replace(/italic$/i, "");
  const hit = Object.entries(WEIGHTS).find(([, n]) => n.toLowerCase() === rest.toLowerCase());
  const name = (hit?.[1] ?? rest).replace(/([a-z])([A-Z])/g, "$1 $2");
  return {
    weight: hit ? Number(hit[0]) : 400,
    italic,
    label: italic ? (rest && rest.toLowerCase() !== "regular" ? `${name} Italic` : "Italic") : name || "Regular",
  };
}

/** The file to set a family in at `weight`: that weight upright, else the Regular, else the first. */
export function pickFace<T extends { filename?: string }>(files: T[], weight = 400): T | undefined {
  const upright = files.filter((f) => !fontStyle(f.filename ?? "").italic);
  return (
    upright.find((f) => fontStyle(f.filename ?? "").weight === weight) ??
    upright.find((f) => fontStyle(f.filename ?? "").weight === 400) ??
    files[0]
  );
}

export const FONT_CATEGORIES = ["Sans Serif", "Serif", "Display", "Handwriting", "Monospace"] as const;

/** A Google Fonts family as the picker shows it. `styles` are "400", "700i": weight, and i for italic. */
export type GoogleFamily = { family: string; category: string; styles: string[]; popularity: number };

/** fonts.google.com/metadata/fonts, trimmed to what search needs. It may start with an XSSI guard. */
export function parseCatalog(raw: string): GoogleFamily[] {
  const { familyMetadataList } = JSON.parse(raw.replace(/^\)\]\}'/, "")) as {
    familyMetadataList: { family: string; category: string; fonts: Record<string, unknown>; popularity: number }[];
  };
  return familyMetadataList.map((f) => ({
    family: f.family,
    category: f.category,
    styles: Object.keys(f.fonts),
    popularity: f.popularity,
  }));
}

/** Names starting with the query first, then containing it; most popular first within each. No query: the most popular. */
export function searchCatalog(list: GoogleFamily[], { q = "", category }: { q?: string; category?: string }) {
  const needle = q.trim().toLowerCase();
  const rank = (f: GoogleFamily) => (f.family.toLowerCase().startsWith(needle) ? 0 : 1);
  return list
    .filter((f) => (!category || f.category === category) && f.family.toLowerCase().includes(needle))
    .sort((a, b) => rank(a) - rank(b) || a.popularity - b.popularity);
}

// ---- specimens and embed code -------------------------------------------------

/**
 * A line to set and a character set to show, per ISO 15924 script, and the
 * language to tag them with: a browser picks Japanese forms of a Han
 * character only when told the text is Japanese. Right-to-left ones say so.
 */
export const SCRIPT_SAMPLES: Record<string, { lang: string; sample: string; glyphs: string; rtl?: true }> = {
  Latn: {
    lang: "en",
    sample: "The quick brown fox jumps over the lazy dog",
    glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &@#%?!.,:;()[]{}\"'",
  },
  Cyrl: {
    lang: "ru",
    sample: "Съешь же ещё этих мягких французских булок, да выпей чаю",
    glyphs: "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ абвгдеёжзийклмнопрстуфхцчшщъыьэюя 0123456789",
  },
  Grek: {
    lang: "el",
    sample: "Ξεσκεπάζω την ψυχοφθόρα βδελυγμία",
    glyphs: "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ αβγδεζηθικλμνξοπρσςτυφχψω 0123456789",
  },
  Arab: {
    lang: "ar",
    rtl: true,
    sample: "نص حكيم له سر قاطع وذو شأن عظيم مكتوب على ثوب أخضر ومغلف بجلد أزرق",
    // Spaced: joined, they would show the connected forms, not the letters.
    glyphs: "ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ء ٠١٢٣٤٥٦٧٨٩",
  },
  Hebr: {
    lang: "he",
    rtl: true,
    sample: "דג סקרן שט בים מאוכזב ולפתע מצא חברה",
    glyphs: "אבגדהוזחטיכךלמםנןסעפףצץקרשת 0123456789",
  },
  Deva: {
    lang: "hi",
    sample: "ऋषियों को सताने वाले दुष्ट राक्षसों के राजा रावण का सर्वनाश करने वाले विष्णुवतार भगवान श्रीराम",
    glyphs: "अआइईउऊऋएऐओऔ कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह ०१२३४५६७८९",
  },
  Hani: {
    lang: "zh",
    sample: "天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。",
    glyphs: "一二三四五六七八九十百千万上下左右中大小人口日月山水火木金土天地",
  },
  Jpan: {
    lang: "ja",
    sample: "いろはにほへと ちりぬるを わかよたれそ つねならむ",
    glyphs: "あいうえお かきくけこ さしすせそ アイウエオ カキクケコ サシスセソ 日本語 漢字",
  },
  Kore: {
    lang: "ko",
    sample: "키스의 고유조건은 입술끼리 만나야 하고 특별한 기술은 필요치 않다",
    glyphs: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ 가나다라마바사아자차카타파하",
  },
  Thai: {
    lang: "th",
    sample: "เป็นมนุษย์สุดประเสริฐเลิศคุณค่า",
    glyphs: "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮ ๐๑๒๓๔๕๖๗๘๙",
  },
};

/** A spec's tracking at `size` px: its em, or of [size, em] pairs the largest size's not over it (below them all, the smallest's). */
export function trackingAt(tracking: number | [number, number][] | undefined, size: number) {
  if (!Array.isArray(tracking)) return tracking;
  const steps = [...tracking].sort((a, b) => a[0] - b[0]);
  return (steps.filter(([s]) => s <= size).at(-1) ?? steps[0])?.[1];
}

const FORMAT: Record<string, string> = { "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "truetype", "font/otf": "opentype" };

/**
 * The code another site loads a family with. A Google face: Google's own
 * <link>, for the weights the brand sets it in (one the family lacks fails
 * Google's request, as it would on Google's page). Else an @font-face per
 * file at `url(id)`, its weight and style read from its name. Nothing for a
 * face with neither: a system face, an Adobe kit.
 */
export function embedCss(
  family: string,
  {
    google,
    files = [],
    weights = [400],
    url,
  }: { google?: boolean; files?: { id: string; filename?: string | null; mime?: string | null }[]; weights?: number[]; url: (id: string) => string },
) {
  if (google && GOOGLE_FAMILY.test(family)) {
    const wght = [...new Set(weights)].sort((a, b) => a - b).join(";");
    return [
      `<link rel="preconnect" href="https://fonts.googleapis.com">`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family.replace(/ +/g, "+")}:wght@${wght}&display=swap">`,
    ].join("\n");
  }
  return files.map((f) => fontFace(family, f, url)).join("\n");
}

/** One font file as @font-face, at the weight and style its name says. The theme (brand-theme.ts) and the token exports write theirs with it too. */
export function fontFace(family: string, file: { id: string; filename?: string | null; mime?: string | null }, url: (id: string) => string) {
  const { weight, italic } = fontStyle(file.filename ?? "");
  const format = FORMAT[file.mime ?? ""];
  const str = JSON.stringify;
  return [
    "@font-face {",
    `  font-family: ${str(family)};`,
    `  src: url(${str(url(file.id))})${format ? ` format(${str(format)})` : ""};`,
    `  font-weight: ${weight};`,
    `  font-style: ${italic ? "italic" : "normal"};`,
    "  font-display: swap;",
    "}",
  ].join("\n");
}
