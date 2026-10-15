"use client";

import { LookProvider, useSiteLook } from "@/components/brand-sections/look";
import { SiteProvider } from "@/components/site/site-context";
import type { SitePortal } from "@/components/site/site-view";
import { fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";
import { type PageView, tree } from "@/lib/site";

/**
 * For stories of the site's parts and sections: a fixture book's page (lib/fixtures/brand-book.ts) as the site
 * around it provides it, its look on a wrapper as SiteView's root wears it, so a part reads in the brand's faces,
 * colors and direction without the rest of the site. Not used by the app.
 */

/** A fixture book's page as a reader gets it. */
export const bookView = (fixture = "blender", page?: string | null, lang?: string | null): PageView => fixtureView(fixture, page, lang);

/** The book's nav as the site draws it, numbered when its theme says so. */
export const rootsOf = (view: PageView) => tree(view.nav, view.theme.numbering);

/** Links in a story stay on the story: `?page=logo#clear-space`. */
export const storyHref = (page: string, section?: string) => `?page=${page}${section ? `#${section}` : ""}`;

/** A portal around the Blender book: its footer, quick grab and terms, on the free plan (Powered by). */
export const PORTAL: SitePortal = {
  slug: "blender",
  level: "everyone",
  madeWith: true,
  brands: [{ slug: "blender", name: "Blender", publishedAt: "2026-09-01T00:00:00.000Z" }],
  site: {
    footer: {
      text: "Blender's guidelines, **unofficial**: a showcase built from its press kit.",
      links: [
        { label: "Press kit", href: "https://www.blender.org/about/logo/" },
        { label: "Contact", href: "mailto:brand@acme.test" },
      ],
      credit: "Made by the Acme brand team",
      feedback: "mailto:brand@acme.test",
    },
    quick: [
      { label: "The logo", asset: "00000000-0000-4000-8000-000000000002", href: fixtureUrl("00000000-0000-4000-8000-000000000002") },
      { label: "Color", page: "color" },
      { label: "Blender's site", href: "https://www.blender.org" },
    ],
    terms: "Use the logo **as it is**: no recoloring, no stretching.\n\nCredit Blender where you use it.",
  },
};

function Looked({ children }: { children: React.ReactNode }) {
  const look = useSiteLook();
  return (
    <div style={look.style} lang={look.lang} dir={look.dir} className={`${look.className} @container/site`}>
      <div className="@container">{children}</div>
    </div>
  );
}

/** A part inside the site it belongs to: `view` from bookView, links kept on the story. */
export function StorySite({ view, portal, children }: { view: PageView; portal?: string; children: React.ReactNode }) {
  return (
    <SiteProvider view={view} href={storyHref} url={fixtureUrl} portal={portal}>
      <LookProvider>
        <Looked>{children}</Looked>
      </LookProvider>
    </SiteProvider>
  );
}
