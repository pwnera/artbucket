import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { BrandProvider } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { inkOn, lift } from "@/lib/color";
import { brand, iconOf } from "@/lib/sidebar";
import "./globals.css";

// With its optical-size axis: small text gets the sturdier cut, headings the tighter one.
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", axes: ["opsz"] });
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

/**
 * An organization's accent as the app's primary color, once per theme and
 * lifted until it shows on that theme's background: a black accent would
 * erase buttons and focus rings in dark. html-qualified, so these outrank
 * globals.css whatever the order. lift() only returns "#rrggbb".
 */
const vars = (c: string) =>
  `--primary:${c};--primary-foreground:${inkOn(c)};--ring:${c};--sidebar-primary:${c};--sidebar-primary-foreground:${inkOn(c)};`;
const accentCss = (accent: string | null) =>
  accent && `html:root{${vars(lift(accent, "#ffffff"))}}html.dark{${vars(lift(accent, "#111111"))}}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [b, h] = await Promise.all([brand(), headers()]);
  const accent = accentCss(b.accent);
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>{accent && <style>{accent}</style>}</head>
      <body className="font-sans antialiased">
        {/* Its script sets the theme before the page paints: it runs under the policy's nonce (src/proxy.ts). */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={h.get("x-nonce") ?? undefined}>
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
