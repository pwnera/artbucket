import { and, eq } from "drizzle-orm";
import type { Browser } from "playwright-core";
import { db } from "@/lib/db";
import { brandPages } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { resolveBrand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { gate } from "@/lib/pool";
import { printToken } from "@/lib/print-token";
import { guidelinesPath } from "@/lib/site";

/**
 * A brand page as a picture: the page drawn by a headless browser at
 * /print/{token}, as readers see it, for an agent that can look but not
 * browse (preview_page, GET .../pages/{page}/preview). Chromium is the
 * server's own (CHROMIUM_PATH), or the machine's Google Chrome in
 * development; without either, the tool says so and hands back the url.
 */

/** As wide as a laptop, or a phone; never taller than this, so one page never makes a 40 MB picture. */
export const WIDTHS = { desktop: 1280, phone: 390 } as const;
const MAX_HEIGHT = 10_000;
const QUALITY = 80;

// ponytail: one browser for the process, launched on first use and kept; a pool if previews queue up.
let browser: Promise<Browser> | null = null;
const launch = () => {
  // Loaded on first use: lib/mcp.ts imports this file, and a broken playwright-core must fail a preview, not every tool.
  browser ??= import("playwright-core")
    .then(({ chromium }) =>
      chromium.launch(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : { channel: "chrome" }),
    )
    .then((b) => {
      b.on("disconnected", () => (browser = null));
      return b;
    })
    .catch((err) => {
      browser = null;
      throw err;
    });
  return browser;
};

/** Two tabs at once, a few more waiting: each is a page's worth of browser memory. */
const tabs = gate(2, 4);

export type Print = { jpeg: Buffer; width: number; height: number; url: string };

/**
 * The page `slug` of `brand` as readers see it now (the draft), at `width`:
 * a JPEG of the whole page, scrolled through first so sections that reveal
 * on scroll are drawn, fonts and pictures loaded.
 */
export async function printPage(caller: Caller, brandSlug: string | undefined, slug: string, o: { width?: keyof typeof WIDTHS; context?: string } = {}): Promise<Print> {
  const ws = caller.project.id;
  const brand = await resolveBrand(ws, brandSlug);
  const [page] = await db
    .select({ slug: brandPages.slug })
    .from(brandPages)
    .where(and(eq(brandPages.brandId, brand.id), eq(brandPages.slug, slug)));
  if (!page) throw new AssetError("not_found", `No page "${slug}" in ${brand.slug}`);
  const url = `${env.APP_URL}${guidelinesPath(brand.slug, { page: slug, context: o.context })}`;
  const token = printToken(env.BETTER_AUTH_SECRET, { ws, brand: brand.slug, page: slug, ...(o.context && { context: o.context }) });
  const width = WIDTHS[o.width ?? "desktop"];

  if (tabs.full) throw new AssetError("rate_limited", "Busy drawing other pages: try again in a moment");
  return tabs.run(1, async () => {
    let b: Browser;
    try {
      b = await launch();
    } catch (err) {
      throw new AssetError("unavailable", `No browser to draw the page with (${(err as Error).message.split("\n")[0]}); open ${url} instead`);
    }
    // Reduced motion: the theme's scroll-driven reveal (globals.css) would leave every section below the fold invisible in a full-page picture.
    const tab = await b.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    try {
      await tab.goto(`${env.INTERNAL_URL ?? env.APP_URL}/print/${token}`, { waitUntil: "networkidle", timeout: 45_000 });
      // Scroll through, a screen at a time, so reveal-on-scroll sections and lazy pictures are drawn; then back to the top.
      await tab.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, (i) => i.complete || new Promise((r) => i.addEventListener("load", r, { once: true }))));
      });
      const height = Math.min(MAX_HEIGHT, await tab.evaluate(() => document.documentElement.scrollHeight));
      const jpeg = await tab.screenshot({ type: "jpeg", quality: QUALITY, clip: { x: 0, y: 0, width, height }, fullPage: true });
      return { jpeg, width, height, url };
    } finally {
      await tab.close().catch(() => {});
    }
  });
}
