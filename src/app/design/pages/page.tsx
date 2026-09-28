"use client";

import Link from "next/link";
import { use } from "react";
import { SiteView } from "@/components/site/site-view";
import { FIXTURES, fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A brand book's pages drawn from a fixture (lib/fixtures/brand-book.ts), with
 * no server and no sign-in: where renderers are built and checked. `?width=`
 * narrows the site's container, not the window, since renderers answer to
 * container queries (D11). `?context=` reads the rules in that context.
 *
 * A client page, so the site's link and URL functions can be handed over; the
 * design layout keeps it to development.
 */

type Query = Record<string, string | string[] | undefined>;

const WIDTHS = ["375", "768", "1280"];

export default function DesignPages({ searchParams }: { searchParams: Promise<Query> }) {
  const q = use(searchParams);
  const one = (k: string) => (typeof q[k] === "string" ? q[k] : undefined);
  const fixture = one("fixture") ?? "blender";
  const page = one("page");
  const width = WIDTHS.includes(one("width") ?? "") ? one("width") : undefined;
  const context = one("context") ?? null;

  const to = (o: { fixture?: string; page?: string; width?: string | null; context?: string | null }) => {
    const u = new URLSearchParams({ fixture: o.fixture ?? fixture });
    const p = "page" in o ? o.page : page;
    const w = "width" in o ? o.width : width;
    const c = "context" in o ? o.context : context;
    if (p) u.set("page", p);
    if (w) u.set("width", w);
    if (c) u.set("context", c);
    return `/design/pages?${u}`;
  };

  let view: PageView | null = null;
  let missing = "";
  try {
    view = { ...fixtureView(fixture, page), context };
  } catch (e) {
    missing = (e as Error).message;
  }
  if (!view)
    return (
      <main className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-semibold">Brand pages</h1>
        <p className="text-muted-foreground">{missing}.</p>
        <p>
          <Link className="underline" href="/design/pages">
            Open the Blender book
          </Link>
        </p>
      </main>
    );

  const chip = (on: boolean) => cn("rounded-md px-2 py-0.5", on ? "bg-foreground text-background" : "hover:bg-muted");
  return (
    <main>
      <nav aria-label="Fixtures" className="bg-background flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2 text-sm backdrop-blur">
        <Row label="Book">
          {Object.keys(FIXTURES).map((f) => (
            <Link key={f} href={to({ fixture: f, page: undefined })} className={chip(f === fixture)} aria-current={f === fixture ? "page" : undefined}>
              {f}
            </Link>
          ))}
        </Row>
        <Row label="Page">
          {view.nav.map((p) => (
            <Link key={p.slug} href={to({ page: p.slug })} className={chip(p.slug === view.page?.slug)} aria-current={p.slug === view.page?.slug ? "page" : undefined}>
              {p.title}
            </Link>
          ))}
        </Row>
        <Row label="Width">
          {[null, ...WIDTHS].map((w) => (
            <Link key={w ?? "full"} href={to({ width: w })} className={chip(w === (width ?? null))}>
              {w ?? "Full"}
            </Link>
          ))}
        </Row>
        <Row label="Context">
          {[null, ...view.contexts].map((c) => (
            <Link key={c ?? "default"} href={to({ context: c })} className={chip(c === context)}>
              {c ?? "default"}
            </Link>
          ))}
        </Row>
      </nav>
      <div className={cn("mx-auto", width && "border-x")} style={width ? { maxWidth: `${width}px` } : undefined}>
        <SiteView view={view} href={(p, s) => `${to({ page: p })}${s ? `#${s}` : ""}`} url={fixtureUrl} />
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground me-1">{label}</span>
      {children}
    </div>
  );
}
