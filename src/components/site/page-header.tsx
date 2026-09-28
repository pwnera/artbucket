"use client";

import { HEAD, LABEL } from "@/components/brand-sections/look";
import { LocalDate } from "@/components/public-grid";
import { SiteLink } from "@/components/site/nav-tree";
import { useMedia, useSite } from "@/components/site/site-context";
import { type NavNode, trail, type ViewPage } from "@/lib/site";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  page: ViewPage;
  /** The nav as a tree (lib/site.ts tree): the trail, the page's number and its sibling tabs come from it. */
  roots: NavNode[];
  onNavigate?: (href: string) => void;
};

/** A section is drawn in the context being read unless it's only for another. */
const drawn = (only: string | undefined, context: string | null) => !only || (only === "default" ? null : only) === context;

/**
 * The top of a page: the trail up to it, its number and eyebrow, its h1 and
 * lede, its cover and when it last changed, and, for a page whose children
 * are tabs (or one of them), those pages as tabs. A page that opens on a
 * cover leaves the heading to the cover, which draws it as the h1.
 */
export function PageHeader({ page, roots, onNavigate }: PageHeaderProps) {
  const { href, url, context } = useSite();
  const path = trail(roots, page.slug);
  const up = path.slice(0, -1);
  const number = path.at(-1)?.number;
  // The page whose children are tabs: this one, or its parent.
  const host = page.tabs ? path.at(-1) : up.at(-1)?.tabs ? up.at(-1) : undefined;
  const tabs = host ? [host, ...host.children] : [];
  const first = page.sections[0];
  const covered = first?.template === "cover" && drawn(first.only, context);
  const cover = useMedia(covered ? undefined : (page.cover ?? undefined));

  if (covered && !up.length && tabs.length < 2) return <></>;
  return (
    <header className={cn("mx-auto w-full max-w-280 space-y-4 px-6 @3xl:px-10", covered ? "pt-6" : "pt-8 pb-4 @3xl:pt-12")}>
      {up.length > 0 && (
        <nav aria-label="Breadcrumb" data-chrome className="print:hidden">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
            {up.map((n) => (
              <li key={n.slug} className="flex items-center gap-1.5">
                <SiteLink href={href(n.slug)} onNavigate={onNavigate} className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-2">
                  {n.title}
                </SiteLink>
                <span aria-hidden>/</span>
              </li>
            ))}
            <li aria-current="page" className="text-foreground min-w-0 truncate">
              {page.title}
            </li>
          </ol>
        </nav>
      )}
      {!covered && (
        <>
          {(number || page.eyebrow) && (
            <p className={cn(LABEL, "text-muted-foreground flex gap-2")}>
              {number && <span className="tabular-nums">{number}</span>}
              {page.eyebrow && <span>{page.eyebrow}</span>}
            </p>
          )}
          <h1 className={cn(HEAD, "text-4xl text-balance @3xl:text-5xl")}>{page.title}</h1>
          {page.lede && <p className="text-muted-foreground max-w-[var(--brand-measure,42rem)] text-lg text-pretty @3xl:text-xl">{page.lede}</p>}
          {page.updatedAt && (
            <p className="text-muted-foreground text-xs">
              Updated <LocalDate at={page.updatedAt} />
            </p>
          )}
          {cover?.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url(cover.id, "/w_1600,f_webp")}
              alt={cover.title ?? cover.description ?? cover.filename}
              decoding="async"
              className={cn(
                "bg-muted aspect-[3/1] w-full rounded-xl",
                // A drawing (a logo) sits whole on its panel; a photo fills it.
                cover.mime === "image/svg+xml" ? "object-contain p-8" : "object-cover",
              )}
              style={cover.focus ? { objectPosition: `${cover.focus.x * 100}% ${cover.focus.y * 100}%` } : undefined}
            />
          )}
        </>
      )}
      {host && tabs.length > 1 && (
        <nav aria-label={`${host.title} pages`} data-chrome className="print:hidden">
          <ul className="flex gap-4 overflow-x-auto border-b">
            {tabs.map((n) => (
              <li key={n.slug} className="shrink-0">
                <SiteLink
                  href={href(n.slug)}
                  onNavigate={onNavigate}
                  aria-current={n.slug === page.slug ? "page" : undefined}
                  className="text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground focus-visible:ring-ring/50 -mb-px block border-b-2 border-transparent py-2 text-sm font-medium outline-none focus-visible:ring-2"
                >
                  {n.title}
                </SiteLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
