"use client";

import { useState } from "react";
import { IconArrowRight, IconBookmark, IconClock, IconFileText, IconInbox, IconLetterCase, IconMovie, IconPhoto, IconSearch, IconX } from "@tabler/icons-react";
import { useNavigate, type SavedSearch } from "@/components/app-sidebar";
import { useCan } from "@/components/can";
import { TypeIcon } from "@/components/catalog";
import { TypeBlock } from "@/components/catalog-matches";
import type { Collection } from "@/components/collections";
import { useShell } from "@/components/shell";
import { liveRecents, usePref, useRecents } from "@/components/sidebar-prefs";
import { Kbd } from "@/components/ui/kbd";
import { canonical } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * Explore before anything is asked: one box that searches everything (the
 * catalog's language, and plain words), a new admin's setup, what you opened
 * (drawn as a search's results are: a block per type, assets as tiles) and
 * searched lately, and what was added last. Later, the same box takes questions.
 */

/** What people searched lately in Explore, newest first: kept in the browser, per person. */
export const useRecentQueries = () => usePref<string[]>("artbucket:recent-queries", []);
export const rememberQuery = (list: string[], q: string) => [q, ...list.filter((x) => x !== q)].slice(0, 8);

const CHIPS: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Logos", href: "/?q=logo", icon: IconPhoto },
  { label: "Images", href: "/?type=image", icon: IconPhoto },
  { label: "Videos", href: "/?type=video", icon: IconMovie },
  { label: "Fonts", href: "/?type=font", icon: IconLetterCase },
  { label: "Documents", href: "/?type=document", icon: IconFileText },
  { label: "In review", href: "/review", icon: IconInbox },
];

type Latest = { id: string; filename: string; metadata?: { title?: string } | null };

export function ExploreStart({ latest, collections, searches, setup }: { latest: Latest[]; collections: Collection[]; searches: SavedSearch[]; setup: React.ReactNode }) {
  const navigate = useNavigate();
  const can = useCan();
  const { forgetSearch } = useShell();
  const [text, setText] = useState("");
  const [queries, setQueries] = useRecentQueries();
  const [stored] = useRecents();
  // Saved searches opened lately are in Recent searches already.
  const recents = liveRecents(stored, collections, searches).filter((r) => r.kind !== "search");
  const opened = (kind: "brand" | "collection") => recents.filter((r) => r.kind === kind).map((r) => ({ key: r.id, href: r.href, name: r.label }));
  const openedAssets = recents.filter((r) => r.kind === "asset");
  const go = (q: string) => q.trim() && navigate(`/?q=${encodeURIComponent(q.trim())}`);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pt-10 pb-16 md:pt-16">
      <div className="space-y-4 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">What are you looking for?</h1>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
          className="relative"
        >
          <IconSearch aria-hidden className="text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2" />
          <input
            autoFocus
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search assets, brands, rules, pages, collections…"
            aria-label="Search everything"
            className="bg-card focus-visible:ring-ring/40 h-14 w-full rounded-2xl border ps-12 pe-24 text-base shadow-sm outline-none focus-visible:ring-4"
          />
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-1 text-xs">
            <Kbd keys={["Enter"]} /> to search
          </span>
        </form>
        <div className="flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => navigate(c.href)}
              className="bg-card hover:border-primary/50 hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
            >
              <c.icon className="size-4" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {setup}

      <section aria-labelledby="opened-title" className="space-y-2">
        <h2 id="opened-title" className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <IconClock className="size-3.5" /> Recently opened
        </h2>
        {recents.length ? (
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {(["brand", "collection"] as const).map((k) => {
              const rows = opened(k);
              return rows.length ? <TypeBlock key={k} type={k} rows={rows} /> : null;
            })}
            {openedAssets.length > 0 && (
              <div className="w-full space-y-1">
                <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <TypeIcon type="asset" className="size-3.5" /> Assets
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {openedAssets.map((a) => (
                    <Tile key={a.id} id={a.id} name={a.label} onClick={() => navigate(a.href)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-sm">Assets, brands and collections you open show here.</p>
        )}
      </section>

      <div className="grid gap-6">
        <Panel title="Recent searches" icon={IconClock} empty="What you search shows here.">
          {queries.map((q) => (
            <Row key={q} onClick={() => go(q)} icon={<IconSearch className="size-4" />} label={q}>
              <button
                type="button"
                aria-label={`Forget ${q}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setQueries(queries.filter((x) => x !== q));
                }}
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
              >
                <IconX className="size-3.5" />
              </button>
            </Row>
          ))}
          {searches.slice(0, 6).map((s) => (
            <Row key={s.id} onClick={() => navigate(`/?${canonical(s.query)}`)} icon={<IconBookmark className="size-4" />} label={s.name}>
              {can("search.delete") && (
                <button
                  type="button"
                  aria-label={`Delete the saved search ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    forgetSearch(s.id);
                  }}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <IconX className="size-3.5" />
                </button>
              )}
            </Row>
          ))}
        </Panel>
      </div>

      {latest.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Added lately</h2>
            <button type="button" onClick={() => navigate("/?browse")} className="text-primary-ink ms-auto inline-flex items-center gap-1 text-sm hover:underline">
              Browse all assets <IconArrowRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {latest.slice(0, 12).map((a) => (
              <Tile key={a.id} id={a.id} name={a.metadata?.title || a.filename} onClick={() => navigate(`/?browse&asset=${a.id}`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, empty, children }: { title: string; icon: React.ComponentType<{ className?: string }>; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.flat().some(Boolean) : !!children;
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Icon className="size-3.5" /> {title}
      </h2>
      {has ? <ul className="bg-card divide-y rounded-xl border">{children}</ul> : <p className="text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-sm">{empty}</p>}
    </section>
  );
}

function Row({ onClick, icon, label, children }: { onClick: () => void; icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
        className={cn("group/row hover:bg-accent flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm outline-none focus-visible:bg-accent")}
      >
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {children}
      </div>
    </li>
  );
}

function Tile({ id, name, onClick }: { id: string; name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={name} className="bg-muted hover:ring-primary/40 aspect-square overflow-hidden rounded-lg border transition-shadow hover:ring-2">
      <Thumb id={id} name={name} />
    </button>
  );
}

/** A picture of it, or its name where there is none to make (a font, a document). */
function Thumb({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-muted-foreground flex size-full items-center justify-center p-2 text-center text-xs break-all">{name}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/a/${id}/w_240,f_webp`} alt={name} loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" />;
}
