import type { Metadata, Viewport } from "next";
import { Funnel_Display, Funnel_Sans, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { BrandProvider } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_BG, inkOn, lift } from "@/lib/color";
import { brand, iconOf } from "@/lib/sidebar";
import "./globals.css";

// The landing page's faces (artbucket.io): Funnel Sans for text, Funnel Display for page titles and section headings.
const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-funnel-sans" });
const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel-display" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

/** Every page is named "Page - {product}", in the brand of whoever sees it (lib/core/branding.ts). */
export async function generateMetadata(): Promise<Metadata> {
  const b = await brand();
  return {
    title: { template: `%s - ${b.name}`, default: b.name },
    description: b.tagline ?? (b.custom ? undefined : "Agent-first, headless-by-design asset management."),
    icons: { icon: iconOf(b) },
  };
}

/** The mobile browser's toolbar, in the page's background for each theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_BG.light },
    { media: "(prefers-color-scheme: dark)", color: APP_BG.dark },
  ],
};

/**
 * An organization's accent as the app's primary color, once per theme and
 * lifted until it shows on that theme's background: a black accent would
 * erase buttons and focus rings in dark. As text (--primary-ink) it is lifted
 * further, to 4.5:1. ponytail: graded on the background only; muted is a
 * step toward the text, so a borderline accent can dip just under 4.5 there.
 * html-qualified, so these outrank globals.css whatever the order. lift() only returns "#rrggbb".
 */
const vars = (accent: string, bg: string) => {
  const c = lift(accent, bg);
  return `--primary:${c};--primary-foreground:${inkOn(c)};--ring:${c};--sidebar-primary:${c};--sidebar-primary-foreground:${inkOn(c)};--primary-ink:${lift(accent, bg, 4.5)};`;
};
const accentCss = (accent: string | null) => accent && `html:root{${vars(accent, APP_BG.light)}}html.dark{${vars(accent, APP_BG.dark)}}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [b, h] = await Promise.all([brand(), headers()]);
  const accent = accentCss(b.accent);
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>{accent && <style>{accent}</style>}</head>
      <body className="font-sans antialiased">
        {/* Its script sets the theme before the page paints: it runs under the policy's nonce (src/proxy.ts). */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange nonce={h.get("x-nonce") ?? undefined}>
          <BrandProvider value={b}>
            <TooltipProvider delayDuration={400} skipDelayDuration={300}>
              {children}
            </TooltipProvider>
          </BrandProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
