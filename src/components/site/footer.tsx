"use client";

import { Markdown } from "@/components/brand-values";
import { LocalDate } from "@/components/public-grid";
import { SiteLink } from "@/components/site/nav-tree";
import { onPortal } from "@/components/site/quick-grab";
import { useSite } from "@/components/site/site-context";
import type { SitePortal } from "@/components/site/site-view";

const LINK = "hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2";

/**
 * The foot of a portal's site: its words (Markdown) and links, when the
 * brand being read was last published and what that changed, where to send
 * feedback, and the credit line.
 */
export function SiteFooter({ portal, base, onNavigate }: { portal: SitePortal; base: string; onNavigate?: (href: string) => void }) {
  const { view } = useSite();
  const f = portal.site.footer ?? {};
  const brand = view.brand.slug;
  const published = portal.brands.find((b) => b.slug === brand)?.publishedAt;
  // What's new is a view of the brand's own path: the first brand's is the portal's root.
  const root = `${base}${brand === portal.brands[0]?.slug ? "" : `/${brand}`}` || "/";
  const web = (h: string) => /^https?:/i.test(h) && { target: "_blank", rel: "noreferrer" };
  return (
    <footer data-chrome className="text-muted-foreground border-t text-sm @6xl/site:col-span-full print:hidden">
      <div className="mx-auto grid w-full max-w-280 gap-6 px-6 py-10 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:px-10">
        <div className="min-w-0 space-y-3">
          {f.text && <Markdown text={f.text} className="max-w-(--brand-measure)" />}
          {!!f.links?.length && (
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {f.links.map((l) => (
                  <li key={l.href + l.label}>
                    <a href={onPortal(base, l.href)} className={LINK} {...web(l.href)}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <div className="space-y-1 @3xl:text-end">
          {published && (
            <p>
              Updated <LocalDate at={published} />
            </p>
          )}
          <p>
            <SiteLink href={`${root}?view=updates`} onNavigate={onNavigate} className={LINK}>
              What&apos;s new
            </SiteLink>
          </p>
          {f.feedback && (
            <p>
              <a href={onPortal(base, f.feedback)} className={LINK} {...web(f.feedback)}>
                Send feedback
              </a>
            </p>
          )}
          {f.credit && <p>{f.credit}</p>}
        </div>
      </div>
    </footer>
  );
}
