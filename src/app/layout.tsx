import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { BrandProvider } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { inkOn } from "@/lib/color";
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

/** An organization's accent, as the app's primary color in light and dark. */
const accentVars = (accent: string | null) =>
  (accent
    ? { "--primary": accent, "--primary-foreground": inkOn(accent), "--ring": accent, "--sidebar-primary": accent, "--sidebar-primary-foreground": inkOn(accent) }
    : undefined) as React.CSSProperties | undefined;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await brand();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} style={accentVars(b.accent)} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <BrandProvider value={b}>
            <TooltipProvider>{children}</TooltipProvider>
          </BrandProvider>
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
