import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/nextjs-vite";
import addonMsw from "msw-storybook-addon";
import { setupWorker } from "msw/browser";
import { ThemeProvider } from "next-themes";
import { fonts } from "../src/app/fonts";
import "../src/app/globals.css";
import { BrandProvider } from "../src/components/brand";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { DEFAULT_BRAND, primaryOf } from "../src/lib/branding";
import { accentCss } from "../src/lib/color";
import { api } from "./mocks";

/**
 * Every story in the app's own theme, light or dark, with the app's fonts. The accent is the product's own, or a
 * brand's as the app takes it with Follow a brand (lib/core/branding.ts): the Artbucket brand's latest release on
 * BrandHub, public and keyless, so Monday's accent shows here too. Kit stories draw that release as well (`loaded.brand`).
 *
 * Stories are CSF Next: `preview.meta({...})` then `meta.story({...})`, typed from here. The API is MSW's
 * (./mocks.ts): what a story loads or saves gets the defaults, or its own `beforeEach: ({ msw }) => msw.use(...)`.
 */
const RULES = "https://hub.artbucket.io/artbucket/artbucket/rules.json";
type Release = { rules: { key: string; context: string | null; value: unknown }[] };
let release: Promise<Release | undefined> | undefined;

export default definePreview({
  addons: [
    addonDocs(),
    addonA11y(),
    addonVitest(),
    // The defaults survive each story's reset; a story's own msw.use() comes first.
    addonMsw(async () => {
      const worker = setupWorker(...api);
      await worker.start({ quiet: true, serviceWorker: { url: "./mockServiceWorker.js" } });
      return worker;
    }),
  ],
  tags: ["autodocs"],
  globalTypes: {
    theme: { description: "Light or dark", toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true } },
    accent: {
      description: "The app's accent",
      toolbar: { title: "Accent", icon: "paintbrush", items: [{ value: "brand", title: "Artbucket brand (live)" }, { value: "product", title: "Product's own" }], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light", accent: "brand" },
  // Offline (a test run without the network) the product's own accent stands in.
  loaders: [async () => ({ brand: await (release ??= fetch(RULES).then((r) => r.json()).then((j) => j.data).catch(() => undefined)) })],
  parameters: {
    layout: "padded",
    controls: { expanded: true, sort: "requiredFirst" },
    nextjs: { appDirectory: true },
    // An axe violation fails the story's test, not just the panel.
    a11y: { test: "error" },
    backgrounds: { disable: true },
    viewport: {
      options: {
        phone: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" },
        tablet: { name: "Tablet", styles: { width: "820px", height: "1180px" }, type: "tablet" },
        laptop: { name: "Laptop", styles: { width: "1280px", height: "800px" }, type: "desktop" },
      },
    },
    docs: { toc: { headingSelector: "h2, h3" } },
    options: { storySort: { order: ["Introduction", "Foundations", "App", ["Primitives", "Patterns", "Features"], "Brand site", "Kit"] } },
  },
  decorators: [
    (Story, { globals, loaded }) => {
      document.documentElement.classList.add(...fonts.split(" "));
      const accent = globals.accent === "brand" && loaded.brand ? primaryOf((loaded.brand as Release).rules) : null;
      const css = accentCss(accent);
      return (
        // Remounted per theme, with no system theme: resolvedTheme (what brand sites read for their night look) is the toolbar's, not the OS's.
        <ThemeProvider key={globals.theme} attribute="class" forcedTheme={globals.theme} defaultTheme={globals.theme} enableSystem={false} disableTransitionOnChange>
          {css && <style>{css}</style>}
          <BrandProvider value={{ ...DEFAULT_BRAND, accent }}>
            <TooltipProvider delayDuration={400}>
              <div className="bg-background text-foreground font-sans antialiased">
                <Story />
              </div>
            </TooltipProvider>
          </BrandProvider>
          <Toaster />
        </ThemeProvider>
      );
    },
  ],
});
