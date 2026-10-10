"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconClock, IconFileText, IconInbox, IconLetterCase, IconMovie, IconPhoto, IconSearch, IconX } from "@tabler/icons-react";
import { useNavigate, type SavedSearch } from "@/components/app-sidebar";
import { useMe } from "@/components/can";
import { CardGrid, ObjectCard, Section } from "@/components/catalog-matches";
import type { Collection } from "@/components/collections";
import { liveRecents, usePref, useRecents } from "@/components/sidebar-prefs";
import { Kbd } from "@/components/ui/kbd";
import { ago, day, short } from "@/lib/time";

/**
 * Explore before anything is asked, laid out like Drive's home: one box
 * that searches everything (its recent searches drop down under
 * it), the filters people reach for, a new admin's setup, then brands and
 * collections (opened lately, then the rest) and assets (opened lately,
 * then added lately), each with why. Later, the same box takes questions.
 */

/** What people searched lately in Explore, newest first: kept in the browser, per person. */
export const useRecentQueries = () => usePref<string[]>("artbucket:recent-queries", []);
export const rememberQuery = (list: string[], q: string) => [q, ...list.filter((x) => x !== q)].slice(0, 8);

const CHIPS: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Images", href: "/?type=image", icon: IconPhoto },
  { label: "Videos", href: "/?type=video", icon: IconMovie },
  { label: "Fonts", href: "/?type=font", icon: IconLetterCase },
  { label: "Documents", href: "/?type=document", icon: IconFileText },
  { label: "In review", href: "/review", icon: IconInbox },
];

type Latest = { id: string; filename: string; createdAt: string; metadata?: { title?: string } | null };

const ext = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toUpperCase() ?? "";

export function ExploreStart({ latest, collections, searches, setup }: { latest: Latest[]; collections: Collection[]; searches: SavedSearch[]; setup: React.ReactNode }) {
  const navigate = useNavigate();
  const project = useMe()?.project.name;
  const [stored] = useRecents();
  const recents = liveRecents(stored, collections, searches);

  const opened = recents.filter((r) => r.kind === "brand" || r.kind === "collection");
  const folders = [
    ...opened.map((r) => ({ key: `${r.kind}:${r.id}`, type: r.kind as "brand" | "collection", name: r.label, sub: `${r.kind === "brand" ? "Brand" : "Collection"} · opened ${short(r.at)} ago`, href: r.href })),
    ...collections
      .filter((c) => !opened.some((r) => r.id === c.id))
      .map((c) => ({ key: `collection:${c.id}`, type: "collection" as const, name: c.name, sub: "Collection", href: `/?collection=${c.id}` })),
  ].slice(0, 8);

  const openedFiles = recents.filter((r) => r.kind === "asset").map((r) => ({ id: r.id, name: r.label, reason: `You opened it ${ago(new Date(r.at))}`, href: r.href }));
  const files = [
    ...openedFiles,
    ...latest
      .filter((a) => !openedFiles.some((r) => r.id === a.id))
      .map((a) => ({ id: a.id, name: a.metadata?.title || a.filename, reason: `Added ${day(a.createdAt)}`, href: `/?browse&asset=${a.id}` })),
  ].slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pt-8 pb-16 md:pt-12">
      <div className="flex flex-col items-center gap-5">
        <h1 className="font-display text-center text-2xl font-semibold tracking-tight md:text-3xl">{project ? `Welcome to ${project}` : "Explore"}</h1>
        <SearchBox />
        <div className="flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => navigate(c.href)}
              className="bg-card hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors"
            >
              <c.icon className="text-muted-foreground size-4" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {setup}

      {folders.length > 0 && (
        <Section title="Brands and collections" aside={<ViewAll href="/catalog">All in the catalog</ViewAll>}>
          <CardGrid>
            {folders.map((f) => (
              <ObjectCard key={f.key} type={f.type} name={f.name} sub={f.sub} onClick={() => navigate(f.href)} />
            ))}
          </CardGrid>
        </Section>
      )}

      {files.length > 0 && (
        <Section title="Assets for you" aside={<ViewAll href="/?browse">All assets</ViewAll>}>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium max-sm:hidden">Reason suggested</th>
                  <th className="px-4 py-2.5 text-end font-medium max-sm:hidden">Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {files.map((f) => (
                  <tr
                    key={f.id}
                    tabIndex={0}
                    onClick={() => navigate(f.href)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(f.href)}
                    className="hover:bg-accent/60 focus-visible:bg-accent cursor-pointer outline-none"
                  >
                    <td className="w-full max-w-0 px-4 py-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="bg-muted size-9 shrink-0 overflow-hidden rounded-md border">
                          <Thumb id={f.id} name={f.name} />
                        </span>
                        <span className="truncate font-medium">{f.name}</span>
                      </span>
                    </td>
                    <td suppressHydrationWarning className="text-muted-foreground px-4 py-2 whitespace-nowrap max-sm:hidden">{f.reason}</td>
                    <td className="text-muted-foreground px-4 py-2 text-end text-xs whitespace-nowrap max-sm:hidden">{ext(f.name)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

const ViewAll = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary-ink inline-flex items-center gap-1 text-sm hover:underline">
    {children} <IconArrowRight className="size-3.5" />
  </Link>
);

/** The box, and under it, while it is empty and focused, what was searched lately, Drive's way. */
function SearchBox() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [queries, setQueries] = useRecentQueries();
  const go = (q: string) => q.trim() && navigate(`/?q=${encodeURIComponent(q.trim())}`);
  const rows = queries.slice(0, 8).map((q) => ({ key: q, label: q, run: () => go(q), forget: () => setQueries(queries.filter((x) => x !== q)) }));
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(text);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      className="relative w-full max-w-2xl"
    >
      <IconSearch aria-hidden className="text-muted-foreground absolute top-6 left-4 size-5 -translate-y-1/2" />
      <input
        autoFocus
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search assets, brands, rules, pages, collections…"
        aria-label="Search everything"
        className="bg-muted/60 focus:bg-card focus:border-border focus-visible:ring-ring/30 h-12 w-full rounded-full border border-transparent ps-12 pe-28 text-base transition-colors outline-none focus:shadow-md focus-visible:ring-4"
      />
      <span className="text-muted-foreground pointer-events-none absolute top-6 right-4 flex -translate-y-1/2 items-center gap-1 text-xs max-sm:hidden">
        <Kbd keys={["Enter"]} /> to search
      </span>
      {open && !text && rows.length > 0 && (
        <ul className="bg-popover animate-in fade-in-0 slide-in-from-top-1 absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border py-1.5 shadow-lg duration-150">
          {rows.map((r) => (
            <li key={r.key} className="group/row flex items-center">
              <button type="button" onClick={r.run} className="hover:bg-accent focus-visible:bg-accent flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-start text-sm outline-none">
                <IconClock className="text-muted-foreground size-4" />
                <span className="truncate">{r.label}</span>
              </button>
              <button
                type="button"
                aria-label={`Forget ${r.label}`}
                onClick={r.forget}
                className="text-muted-foreground hover:text-foreground me-2 rounded p-1 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
              >
                <IconX className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** A picture of it, or its kind where there is none to make (a font, a document). */
function Thumb({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-muted-foreground flex size-full items-center justify-center text-[10px] font-medium">{ext(name)}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/a/${id}/w_96,f_webp`} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />;
}
