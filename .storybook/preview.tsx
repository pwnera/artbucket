import type { Preview } from "@storybook/nextjs-vite";
import { ThemeProvider } from "next-themes";
import { fonts } from "../src/app/fonts";
import "../src/app/globals.css";
import { BrandProvider } from "../src/components/brand";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { DEFAULT_BRAND, primaryOf } from "../src/lib/branding";
import { accentCss } from "../src/lib/color";

/**
 * Every story in the app's own theme, light or dark, with the app's fonts. The accent is the product's own, or a
 * brand's as the app takes it with Follow a brand (lib/core/branding.ts): the Artbucket brand's latest release on
 * BrandHub, public and keyless, so Monday's accent shows here too. Kit stories draw that release as well (`loaded.brand`).
 */
const RULES = "https://hub.artbucket.io/artbucket/artbucket/rules.json";
type Release = { rules: { key: string; context: string | null; value: unknown }[] };
let release: Promise<Release> | undefined;

const preview: Preview = {
  globalTypes: {
    theme: { description: "Light or dark", toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true } },
    accent: {
      description: "The app's accent",
      toolbar: { title: "Accent", icon: "paintbrush", items: [{ value: "brand", title: "Artbucket brand (live)" }, { value: "product", title: "Product's own" }], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light", accent: "brand" },
  loaders: [async () => ({ brand: await (release ??= fetch(RULES).then((r) => r.json()).then((j) => j.data)) })],
  parameters: { layout: "padded", controls: { expanded: true } },
  decorators: [
    (Story, { globals, loaded }) => {
      document.documentElement.classList.add(...fonts.split(" "));
      const accent = globals.accent === "brand" && loaded.brand ? primaryOf((loaded.brand as Release).rules) : null;
      const css = accentCss(accent);
      return (
        <ThemeProvider attribute="class" forcedTheme={globals.theme} disableTransitionOnChange>
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
};
export default preview;
