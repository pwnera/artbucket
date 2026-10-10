"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { AppHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TYPE_LABEL, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * One search over every type (GET /api/v1/catalog): results grouped by type,
 * refined by type and project, retired matches counted aside, and the same
 * query as an agent would send it.
 */

export type Results = CatalogResults;

const GROUPS: CatalogType[] = ["asset", "rule", "page", "brand", "collection", "portal"];
const HINTS = ["type:asset", "status:current", "project:", "uses:", "tag:"];

export function CatalogSearch({ q, type, project, results }: { q: string; type: string | null; project: string | null; results: Results | null }) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const href = (next: { type?: string | null; project?: string | null }) => {
    const p = new URLSearchParams({ q });
    const t = next.type === undefined ? type : next.type;
    const pr = next.project === undefined ? project : next.project;
    if (t) p.set("type", t);
    if (pr) p.set("project", pr);
    return `/catalog/search?${p}`;
  };
  const apiQuery = new URLSearchParams({ q, ...(type && { type }), ...(project && { project }) });
  return (
    <>
      <AppHeader trail={[{ label: "Catalog", href: "/catalog" }, { label: "Search" }]}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/catalog">
            <IconArrowLeft /> Back to the explorer
          </Link>
        </Button>
      </AppHeader>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6 pb-16 md:px-6">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/catalog/search?q=${encodeURIComponent(text.trim())}`);
          }}
          className="space-y-2"
        >
          <label className="relative block">
            <span className="sr-only">Search the catalog</span>
            <IconSearch aria-hidden className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2" />
            <Input autoFocus type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="logo status:current" className="h-11 ps-10 text-base" />
          </label>
          <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            Narrow with
            {HINTS.map((h) => (
              <button key={h} type="button" onClick={() => setText((t) => `${t.trim()} ${h}`.trim())}>
                <Badge variant="secondary" className="font-mono">
                  {h}
                </Badge>
              </button>
            ))}
          </p>
        </form>
        {results && (
          <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
            <aside aria-label="Refine" className="space-y-5 text-sm">
              <Refine label="Type">
                <Item href={href({ type: null })} on={!type} label="Everything" count={null} />
                {GROUPS.filter((g) => results.counts[g] || type === g).map((g) => (
                  <Item key={g} href={href({ type: g })} on={type === g} label={TYPE_LABEL[g].many} count={results.counts[g] ?? 0} icon={<TypeIcon type={g} className="size-4" />} />
                ))}
              </Refine>
              {results.projects.length > 0 && (
                <Refine label="Project">
                  {project && <Item href={href({ project: null })} on={false} label="Every project" count={null} />}
                  {results.projects.map((p) => (
                    <Item key={p.slug} href={href({ project: p.slug })} on={project === p.slug} label={p.name} count={p.count} />
                  ))}
                </Refine>
              )}
              <div className="bg-muted/50 space-y-2 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Same query for agents</p>
                <code className="block font-mono text-xs break-all">GET /api/v1/catalog?{apiQuery.toString()}</code>
                <code className="block font-mono text-xs break-all">search_catalog({JSON.stringify({ q })})</code>
              </div>
            </aside>
            <div className="min-w-0 space-y-6">
              <p className="text-muted-foreground text-sm">
                {results.total} {results.total === 1 ? "result" : "results"}
                {results.query && (
                  <>
                    {" "}
                    for <b className="text-foreground">{results.query}</b>
                  </>
                )}
                . Only what you can reach is counted.
              </p>
              {GROUPS.map((g) => {
                const list = results.items.filter((i) => i.type === g);
                if (!list.length) return null;
                return (
                  <section key={g} className="space-y-2">
                    <h2 className="flex items-center gap-2 font-medium">
                      {TYPE_LABEL[g].many} <span className="text-muted-foreground text-sm tabular-nums">{results.counts[g]}</span>
                    </h2>
                    <ul className="bg-card divide-y rounded-xl border">
                      {list.map((i) => (
                        <li key={i.id}>
                          <Link href={`/catalog?o=${i.id}`} className="hover:bg-accent flex items-center gap-3 px-3 py-2.5 text-sm">
                            {g === "asset" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/a/${i.id}/w_80,f_webp`} alt="" className="bg-muted size-9 shrink-0 rounded object-contain" />
                            ) : (
                              <TypeIcon type={i.type} className="text-muted-foreground size-4 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{i.name}</span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {i.parent ? `${TYPE_LABEL[i.type].one} in ${i.parent.name}` : i.project.name}
                                {i.release ? ` · @${i.release}` : ""}
                              </span>
                            </span>
                            {i.status !== "current" && <StatusBadge status={i.status} />}
                            {i.expiring && <Badge variant="warning">Expires {i.expires}</Badge>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {results.hidden.count > 0 && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="warning">Hidden</Badge>
                  {results.hidden.example}
                  {results.hidden.count > 1 && ` ${results.hidden.count - 1} more ${results.hidden.count === 2 ? "is" : "are"} left out too.`} Add{" "}
                  <code className="font-mono">status:replaced</code> or <code className="font-mono">status:archived</code> to see them.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const Refine = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-muted-foreground px-2 text-xs font-medium uppercase">{label}</p>
    {children}
  </div>
);

const Item = ({ href, on, label, count, icon }: { href: string; on: boolean; label: string; count: number | null; icon?: React.ReactNode }) => (
  <Link
    href={href}
    aria-current={on ? "page" : undefined}
    className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", on ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-accent")}
  >
    {icon}
    <span className="truncate">{label}</span>
    {count !== null && <span className="text-muted-foreground ms-auto text-xs tabular-nums">{count}</span>}
  </Link>
);
