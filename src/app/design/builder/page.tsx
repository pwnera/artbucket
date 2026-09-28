"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Builder } from "@/components/builder/builder";
import type { Transport } from "@/components/builder/use-builder";
import type { Init, NavEntry } from "@/lib/builder-ops";
import { FIXTURES, fixtureView } from "@/lib/fixtures/brand-book";
import { boundKeys, parseSections } from "@/lib/pages";
import { cn } from "@/lib/utils";

/**
 * The builder on a fixture (lib/fixtures/brand-book.ts), with no server and
 * no sign-in: `?fixture=blender|big`. Writes are recorded below instead of
 * sent, and opening another page answers from the fixture, so the canvas can
 * be checked by eye. A client page, so the transport can be handed over; the
 * design layout keeps it to development.
 */

type Query = Record<string, string | string[] | undefined>;
type Write = { method: string; url: string; body?: unknown };

/** The book as the route would load it: its pages as GET .../pages lists them, its first page's view, every rule. */
function fixtureInit(name: string): Init {
  const book = FIXTURES[name]();
  const view = fixtureView(name);
  const nav = book.pages.map(
    (p, position): NavEntry => ({
      slug: p.slug,
      title: p.title,
      position,
      hidden: p.hidden ?? false,
      parent: p.parent ?? null,
      eyebrow: p.eyebrow ?? null,
      lede: p.lede ?? null,
      cover: p.cover ?? null,
      icon: p.icon ?? null,
      audience: p.audience ?? "everyone",
      tabs: p.tabs ?? false,
      layout: p.layout ?? "book",
      aliases: [],
      translations: p.translations ?? null,
      updatedAt: null,
      keys: [...new Set(parseSections(p.sections).sections.flatMap(boundKeys))],
    }),
  );
  return { nav, view, rules: view.rules, theme: book.theme };
}

export default function DesignBuilder({ searchParams }: { searchParams: Promise<Query> }) {
  const q = use(searchParams);
  const fixture = typeof q.fixture === "string" ? q.fixture : "blender";
  const [writes, setWrites] = useState<Write[]>([]);

  const init = useMemo(() => {
    try {
      return Object.hasOwn(FIXTURES, fixture) ? fixtureInit(fixture) : null;
    } catch {
      return null;
    }
  }, [fixture]);

  // Reads answer from the fixture; writes are kept to show, and succeed.
  const transport = useMemo<Transport>(
    () => async (method, url, body) => {
      if (method !== "GET") {
        setWrites((w) => [...w, { method, url, body }]);
        return { ok: true, data: {} };
      }
      const u = new URL(url, location.origin);
      if (u.pathname.endsWith("/view")) {
        try {
          return { ok: true, data: fixtureView(fixture, u.searchParams.get("page")) };
        } catch (e) {
          return { ok: false, network: false, status: 404, error: { message: (e as Error).message } };
        }
      }
      return { ok: false, network: false, status: 404, error: { message: `Not on the dev page: GET ${u.pathname}` } };
    },
    [fixture],
  );

  if (!init)
    return (
      <main className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-semibold">Builder</h1>
        <p className="text-muted-foreground">
          No fixture &quot;{fixture}&quot;; there are {Object.keys(FIXTURES).join(", ")}.
        </p>
        <p>
          <Link className="underline" href="/design/builder">
            Open the Blender book
          </Link>
        </p>
      </main>
    );

  return (
    <main>
      <nav aria-label="Fixtures" className="bg-background flex flex-wrap items-center gap-1 border-b px-4 py-2 text-sm">
        <span className="text-muted-foreground me-1">Book</span>
        {Object.keys(FIXTURES).map((f) => (
          <Link
            key={f}
            href={`/design/builder?fixture=${f}`}
            aria-current={f === fixture ? "page" : undefined}
            className={cn("rounded-md px-2 py-0.5", f === fixture ? "bg-foreground text-background" : "hover:bg-muted")}
          >
            {f}
          </Link>
        ))}
      </nav>
      <Builder key={fixture} brand={fixture} init={init} transport={transport} />
      <details className="border-t px-4 py-3 text-sm">
        <summary className="text-muted-foreground cursor-pointer">Writes recorded: {writes.length}</summary>
        <ol className="mt-2 space-y-2">
          {writes.map((w, i) => (
            <li key={i}>
              <p className="font-mono text-xs font-medium">
                {w.method} {w.url}
              </p>
              {w.body !== undefined && <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs">{JSON.stringify(w.body, null, 2)}</pre>}
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}
