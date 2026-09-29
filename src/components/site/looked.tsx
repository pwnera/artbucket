"use client";

import { useMemo } from "react";
import { Markdown } from "@/components/brand-values";
import { useGround } from "@/components/brand-sections/frame";
import { HEAD, LABEL, LookProvider, useSiteLook } from "@/components/brand-sections/look";
import { SiteProvider, useSite } from "@/components/site/site-context";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A look as the API hands it out (lib/core/page-view.ts viewLook): a brand's, or with none, the organization's accent over the app's. */
export type BrandLook = { brand: { slug: string; name: string } | null; theme: PageView["theme"]; signed: Record<string, string> };

/** The site around no page: enough of a view for its provider. With no brand, its slug is "". */
const viewOf = (look: BrandLook, name: string): PageView => ({
  brand: look.brand ?? { slug: "", name },
  version: null,
  context: null,
  contexts: [],
  lang: null,
  theme: look.theme,
  nav: [],
  page: null,
  locked: false,
  rules: [],
  media: {},
  collections: {},
  signed: look.signed,
  warnings: [],
  missing: [],
});

const home = () => "/";

/**
 * A page that is not one of the brand's but should read as part of its site
 * (a portal's Assets view, a share link): its faces, colors, surface and
 * corners, for everything inside and for dialogs that portal out of it.
 * `before` sits above it in the app's own look (a portal's header). With no
 * brand, titles take the app's display face.
 */
export function Looked({
  look,
  name,
  href = home,
  portal,
  headers,
  before,
  children,
}: {
  look: BrandLook;
  /** What the site is called when no brand names it. */
  name: string;
  href?: (page: string, section?: string) => string;
  portal?: string;
  headers?: () => HeadersInit;
  before?: React.ReactNode;
  children: React.ReactNode;
}) {
  const view = useMemo(() => viewOf(look, name), [look, name]);
  return (
    <SiteProvider view={view} href={href} portal={portal} headers={headers}>
      <LookProvider>
        {before}
        <Root plain={!look.brand}>{children}</Root>
      </LookProvider>
    </SiteProvider>
  );
}

function Root({ plain, children }: { plain: boolean; children: React.ReactNode }) {
  const look = useSiteLook();
  return (
    <div
      style={{ ...(plain && { "--brand-head": "var(--font-display)" }), ...look.style } as React.CSSProperties}
      lang={look.lang}
      dir={look.dir}
      className={cn(look.className, "@container/site flex min-h-svh flex-col")}
    >
      {children}
    </div>
  );
}

/**
 * The top of such a page, as a page of the site opens (site/page-header.tsx):
 * on the brand's band when its pages open on one, else on the page. With no
 * brand, on a tint of the accent. `children` go under the words.
 */
export function Opening({ eyebrow, title, lede, children }: { eyebrow?: string | null; title: string; lede?: string | null; children?: React.ReactNode }) {
  const { view } = useSite();
  const ground = useGround({ tone: !view.brand.slug ? "tint" : view.theme.band ? "brand" : "plain" });
  return (
    <div className={ground.className} style={ground.style}>
      <header className="mx-auto w-full max-w-280 space-y-5 px-6 pt-[calc(var(--brand-gap)*4/3)] pb-[calc(var(--brand-gap)*4/3)] @3xl/site:px-10 @3xl/site:pt-[calc(var(--brand-gap)*2)] @3xl/site:pb-[calc(var(--brand-gap)*2)]">
        <div className="space-y-4">
          {eyebrow && <p className={cn(LABEL, "text-muted-foreground")}>{eyebrow}</p>}
          <h1 className={cn(HEAD, "text-[length:min(var(--brand-h1),12cqi)] leading-[1.05] break-words text-balance")}>{title}</h1>
          {lede && <Markdown text={lede} className="text-muted-foreground max-w-(--brand-measure) text-lg text-pretty @3xl/site:text-xl" />}
        </div>
        {children}
      </header>
    </div>
  );
}
