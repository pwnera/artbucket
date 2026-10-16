/**
 * Writes .storybook/google-fonts.json: what Google Fonts answers for src/app/fonts.ts, through Next's own loader,
 * which Storybook's builds read instead of asking it (NEXT_FONT_GOOGLE_MOCKED_RESPONSES, .storybook/main.ts): one
 * failed fetch there failed the whole build on CI. The faces themselves still load from fonts.gstatic.com.
 * Run it after changing the app's faces (the build names the URL it misses):
 *
 *   node .storybook/google-fonts-refresh.mjs
 */
import { writeFileSync } from "node:fs";
import { fetchCSSFromGoogleFonts } from "next/dist/compiled/@next/font/dist/google/fetch-css-from-google-fonts.js";
import { getFontAxes } from "next/dist/compiled/@next/font/dist/google/get-font-axes.js";
import { getGoogleFontsUrl } from "next/dist/compiled/@next/font/dist/google/get-google-fonts-url.js";
import { validateGoogleFontFunctionCall } from "next/dist/compiled/@next/font/dist/google/validate-google-font-function-call.js";

// As src/app/fonts.ts calls them.
const CALLS = [
  ["Funnel_Sans", { subsets: ["latin"], variable: "--font-funnel-sans" }],
  ["Funnel_Display", { subsets: ["latin"], variable: "--font-funnel-display" }],
  ["Geist_Mono", { subsets: ["latin"], variable: "--font-geist-mono" }],
];

const out = {};
for (const [fn, props] of CALLS) {
  const { fontFamily, weights, styles, selectedVariableAxes, display } = validateGoogleFontFunctionCall(fn, props);
  const url = getGoogleFontsUrl(fontFamily, getFontAxes(fontFamily, weights, styles, selectedVariableAxes), display);
  out[url] = await fetchCSSFromGoogleFonts(url, fontFamily, true);
}
writeFileSync(new URL("./google-fonts.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
