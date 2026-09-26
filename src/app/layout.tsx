import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// One family throughout. The variable lives on <html> so :root can resolve it:
// the type-scale classes in globals.css read it from there, not from <body>.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Artbucket",
  description: "Agent-first, headless-by-design asset management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
