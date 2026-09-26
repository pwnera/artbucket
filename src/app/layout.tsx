import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";

// Fredoka for display, Inter for everything else - the two families the
// ArtBucket design system defines. Fredoka is loaded at 500/600 only.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fredoka",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArtBucket",
  description: "Agent-first, headless-by-design asset management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
