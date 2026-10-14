import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { BrandProvider } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fonts } from "@/app/fonts";
import { accentCss, APP_BG } from "@/lib/color";
import { brand, iconOf } from "@/lib/sidebar";
import "./globals.css";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [b, h] = await Promise.all([brand(), headers()]);
  const accent = accentCss(b.accent);
  return (
    <html lang="en" className={fonts} data-scroll-behavior="smooth" suppressHydrationWarning>
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
