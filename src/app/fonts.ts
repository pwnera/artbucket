import { Funnel_Display, Funnel_Sans, Geist_Mono } from "next/font/google";

// The landing page's faces (artbucket.io): Funnel Sans for text, Funnel Display for page titles and section headings.
const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-funnel-sans" });
const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel-display" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

/** The three faces' CSS variables, for <html> (app/layout.tsx, .storybook/preview.tsx). */
export const fonts = `${sans.variable} ${display.variable} ${mono.variable}`;
