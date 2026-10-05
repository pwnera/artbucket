"use client";

import { Markdown } from "@/components/brand-values";
import { LocalDate } from "@/components/public-grid";
import { SiteLink } from "@/components/site/nav-tree";
import { onPortal } from "@/components/site/quick-grab";
import { useSite } from "@/components/site/site-context";
import type { SitePortal } from "@/components/site/site-view";
import { AppIcon } from "@/components/brand";
import { POWERED_BY_URL } from "@/lib/branding";

const LINK = "hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2";

/**
 * The foot of a portal's site: its words (Markdown) and links, when the
 * brand being read was last published and what that changed, where to send
 * feedback, and the credit line; without white-label, "Powered by Artbucket".
 */
export function SiteFooter({
  portal,
  base,
  onNavigate,
  privacy,
}: {
  portal: Pick<SitePortal, "slug" | "site" | "brands" | "madeWith">;
  base: string;
  onNavigate?: (href: string) => void;
  /** The server's privacy policy (PRIVACY_URL), unless the footer's own links name one. */
  privacy?: string | null;
}) {
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
          {privacy && !f.links?.some((l) => /privacy/i.test(l.label)) && (
            <p>
              <PrivacyLink href={privacy} className={LINK} />
            </p>
          )}
          {portal.madeWith && (
            <p className="pt-2">
              <PoweredBy slug={portal.slug} />
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

/** The server's privacy policy (PRIVACY_URL), where visitors without an account land: a plain word, no product mark, so white-label holds. */
export function PrivacyLink({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className ?? LINK}>
      Privacy
    </a>
  );
}

/** Under a form that asks a visitor for their email: who gets it, what for, and the policy. */
export function AskNotice({ privacy }: { privacy?: string | null }) {
  return (
    <p className="text-muted-foreground text-xs text-pretty">
      Sent to the team behind this portal, only to answer you.
      {privacy && (
        <>
          {" "}
          <PrivacyLink href={privacy} className={`${LINK} underline`} />
        </>
      )}
    </p>
  );
}

/**
 * A portal's "Powered by Artbucket", as a small pill: on the free plan, which
 * has no white-label. Its link says which portal sent the visitor.
 */
export function PoweredBy({ slug }: { slug: string }) {
  const href = `${POWERED_BY_URL}?utm_source=${encodeURIComponent(slug)}&utm_medium=portal&utm_campaign=powered-by`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="bg-background text-muted-foreground hover:text-foreground hover:border-foreground/20 focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-xs transition-colors outline-none focus-visible:ring-2"
    >
      Powered by
      <AppIcon className="size-3.5" />
      <span className="text-foreground font-medium">Artbucket</span>
    </a>
  );
}
