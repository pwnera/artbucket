"use client";

import Link from "next/link";
import {
  IconAdjustmentsHorizontal,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBrandGit,
  IconCircle,
  IconCircleCheckFilled,
  IconCode,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGitCompare,
  IconHistory,
  IconListCheck,
  IconListDetails,
  IconPalette,
  IconPhoto,
  IconPlus,
  IconWorldUpload,
} from "@tabler/icons-react";
import { call, curl, ForAgents } from "@/components/agent-access";
import { IconButton } from "@/components/icon-button";
import { PageTrail } from "@/components/builder/page-tree";
import type { BuilderApi, Panel } from "@/components/builder/use-builder";
import { SaveStatus } from "@/components/save-status";
import { tokensPath } from "@/components/tokens-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { boundKeys, designWarnings, hasPicture } from "@/lib/pages";
import type { StepId } from "@/lib/readiness";
import { contextLabel } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * The bar over the canvas (build spec 3.5.3, W6.3), in the order a page is
 * made: where you are (PageTrail: the brand's tabs as a menu, the pages above, the page's
 * title, which opens its settings), then SaveStatus, undo and redo
 * (b.undo, b.redo), the context and language switches (b.setContext,
 * b.setLang) when the brand has more than one, then the three things an
 * editor reaches for, named: Add (a panel beside the canvas, b.setDock),
 * Library (assets to drag onto the page, b.setLibrary),
 * Rules (b.setPanel) and Theme, which previews the whole site with the theme
 * panel beside it (b.setPreview, b.setDock). Then the launch checklist (b.status and the
 * page's own checks), what changed since the last publish (b.setChanges), For agents, Preview (b.setPreview), More (the section
 * panel, History, Design tokens) and Publish, which says whether readers see
 * the latest (b.status.publish).
 *
 * The context switch only sets b.state.context: the canvas's site resolves
 * each bound rule for it (lib/rules.ts resolve, through useRule), with no
 * fetch. In preview the bar steps aside for a Theme toggle and an Exit
 * preview button, so keep it mounted then too. Its keys (Cmd+Z, P, H, T, Esc) are the builder's; the
 * bar only names them. Words drop to icons, with their name in a tooltip,
 * when the bar is narrow.
 *
 * Props:
 * - b: the builder.
 */
export type TopBarProps = {
  b: BuilderApi;
};

const DEFAULT = "*";

/** A named tool on the bar: its word shows when there is room, its tooltip always. */
function Tool({ label, icon, pressed, ...p }: Omit<React.ComponentProps<typeof Button>, "children"> & { label: string; icon: React.ReactNode; pressed?: boolean }) {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={label}
      aria-pressed={pressed}
      className="aria-pressed:bg-accent gap-1.5 px-2 @5xl/bar:px-2.5"
      {...p}
    >
      {icon}
      <span className="hidden @5xl/bar:inline">{label}</span>
    </IconButton>
  );
}

const Sep = () => <span aria-hidden className="bg-border mx-1 hidden h-5 w-px @3xl/bar:block" />;

export function TopBar({ b }: TopBarProps) {
  if (b.state.preview) {
    const theming = b.dock === "theme";
    return (
      // Clear of the Theme panel (w-80) while it is open beside the site.
      <div className={cn("app-tokens fixed bottom-4 z-40 flex gap-2", theming && !b.floating ? "end-84" : "end-4")}>
        <Button variant="secondary" size="sm" className="shadow-lg" aria-pressed={theming} onClick={() => b.setDock(theming ? null : "theme")}>
          <IconPalette /> {theming ? "Hide theme" : "Theme"}
        </Button>
        <Button variant="secondary" size="sm" className="shadow-lg" onClick={() => b.setPreview(false)}>
          <IconEyeOff /> Exit preview <Kbd keys={["Esc"]} />
        </Button>
      </div>
    );
  }

  const languages = b.view.theme.settings.languages ?? [];
  const contexts = b.view.contexts;
  const context = b.state.context ?? undefined;

  return (
    <header className="app-tokens bg-background text-foreground @container/bar sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <PageTrail b={b} />

      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        <SaveStatus className="me-1 hidden @4xl/bar:flex" />
        <IconButton variant="ghost" label="Undo" shortcut={["mod", "Z"]} disabled={!b.canUndo} onClick={b.undo}>
          <IconArrowBackUp />
        </IconButton>
        <IconButton variant="ghost" label="Redo" shortcut={["mod", "⇧", "Z"]} disabled={!b.canRedo} onClick={b.redo}>
          <IconArrowForwardUp />
        </IconButton>

        {contexts.length > 0 && (
          <Select value={b.state.context ?? DEFAULT} onValueChange={(c) => b.setContext(c === DEFAULT ? null : c)}>
            <SelectTrigger size="sm" aria-label="Show the rules for a context" className="ms-1 max-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="app-tokens">
              <SelectItem value={DEFAULT}>Default</SelectItem>
              {contexts.map((c) => (
                <SelectItem key={c} value={c}>
                  {contextLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {languages.length > 1 && (
          // The first language is the one the pages are written in: null shows them as written.
          <Select value={b.state.lang ?? languages[0].code} onValueChange={(l) => b.setLang(l === languages[0].code ? null : l)}>
            <SelectTrigger size="sm" aria-label="Show the pages in a language" className="ms-1 max-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="app-tokens">
              {languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Sep />
        <Tool label="Add" icon={<IconPlus />} pressed={b.dock === "insert"} onClick={() => b.setDock(b.dock === "insert" ? null : "insert")} />
        <Tool label="Library" icon={<IconPhoto />} pressed={b.library} onClick={() => b.setLibrary(!b.library)} />
        <Tool label="Rules" icon={<IconListDetails />} aria-haspopup="dialog" onClick={() => b.setPanel("rules")} />
        <Tool
          label="Theme"
          icon={<IconPalette />}
          onClick={() => {
            // The theme is the whole site's look: shown on the whole site, the panel beside it.
            b.setDock("theme");
            b.setPreview(true);
          }}
        />
        <Sep />
        <IconButton variant="ghost" label="Mark what changed since the last release" aria-pressed={b.changes} className="aria-pressed:bg-accent" onClick={() => b.setChanges(!b.changes)}>
          <IconGitCompare />
        </IconButton>
        <Checklist b={b} />
        <ForAgents
          about={`These rules as data, in this order${context ? `, resolved for ${contextLabel(context)}` : ", every variant included"}. Agents read them before making anything on-brand; brand_status tells an agent what the brand still lacks.`}
          reads={brandReads(b.view.brand.slug, context)}
        />
        <IconButton variant="ghost" label="Preview as readers see it" shortcut={["P"]} onClick={() => b.setPreview(true)}>
          <IconEye />
        </IconButton>
        <More b={b} />
        {b.source?.source ? (
          <Repository b={b} />
        ) : (
          b.source?.connect && (
            // Not kept in a repository yet, and this person may connect one: say so on the bar, not in a menu.
            <IconButton asChild variant="ghost" size="sm" label="Keep this brand in a Git repository" className="gap-1.5 px-2 @5xl/bar:px-2.5">
              <a href={b.source.connect}>
                <IconBrandGit />
                <span className="hidden @5xl/bar:inline">Git</span>
              </a>
            </IconButton>
          )
        )}
        <Publish b={b} />
      </div>
    </header>
  );
}

/** What the bar keeps out of the way: the section panel, History and Design tokens, with their keys. */
function More({ b }: { b: BuilderApi }) {
  const open = (p: Panel) => () => b.setPanel(p);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" label="More">
          <IconDots />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="app-tokens w-56">
        <DropdownMenuItem onSelect={() => b.setDock(b.dock === "section" ? null : "section")}>
          <IconAdjustmentsHorizontal /> {b.dock === "section" ? "Hide section settings" : "Section settings"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => b.setPageSettings(b.state.selection.page)}>
          <IconAdjustmentsHorizontal /> Page settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={open("history")}>
          <IconHistory /> History <DropdownMenuShortcut>H</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={open("tokens")}>
          <IconCode /> Design tokens <DropdownMenuShortcut>T</DropdownMenuShortcut>
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The repository the brand is kept in too: whether the edits made here have reached it, and where it is. */
function Repository({ b }: { b: BuilderApi }) {
  const s = b.source!.source!;
  const manage = b.source!.connect;
  const where = s.remote.replace(/^https?:\/\//, "").replace(/\.git$/, "");
  const label = s.pending ? `Changes here not yet in ${where}` : `In step with ${where}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton variant="ghost" size="sm" label={label} className="relative">
          <IconBrandGit />
          {s.pending && (
            <span className="bg-warning ring-background absolute top-1 end-1 size-2 rounded-full ring-2">
              <span className="sr-only">(changes to sync)</span>
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="app-tokens grid w-80 gap-2 p-3 text-sm">
        <p className="font-medium">Kept in a repository</p>
        <a href={s.remote} target="_blank" rel="noreferrer" className="truncate underline underline-offset-2">
          {where}
        </a>
        <p className="text-muted-foreground text-xs">
          {s.branch}
          {s.path ? `, in ${s.path}/` : ""}
          {s.commit ? `, at ${s.commit.slice(0, 7)}` : ""}
        </p>
        <p className="text-muted-foreground text-xs">
          {s.pending
            ? "Edits made here since the last sync go to the repository next: as a commit, or a pull request to review."
            : "The brand here and its files say the same. Changes merged there come here, and edits here go there."}
        </p>
        {manage && (
          <a href={manage} className="text-xs underline underline-offset-2">
            Manage the connection
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Publish, saying where readers stand: a dot while they don't see the latest, Published once they do. */
function Publish({ b }: { b: BuilderApi }) {
  const state = b.status?.publish;
  const open = () => b.setPanel("publish");
  if (state === "current")
    return (
      <Button size="sm" variant="outline" className="ms-1" aria-haspopup="dialog" title="Readers see the latest" onClick={open}>
        <IconCircleCheckFilled className="text-success" /> Released
      </Button>
    );
  return (
    <Button size="sm" className="relative ms-1" aria-haspopup="dialog" title={state === "behind" ? "There are changes readers don't see yet" : state === "never" ? "Never released: portals show nothing of it" : undefined} onClick={open}>
      <IconWorldUpload /> Release
      {state === "behind" && (
        <span className="bg-warning ring-background absolute -top-1 -end-1 size-2.5 rounded-full ring-2">
          <span className="sr-only">(changes not released)</span>
        </span>
      )}
    </Button>
  );
}

/** What each step of the launch checklist opens: the panel, dialog or page where it is done. */
function actionOf(b: BuilderApi, id: StepId): { label: string; run?: () => void; href?: string } {
  switch (id) {
    case "colors":
    case "type":
    case "logo":
    case "voice":
      return { label: "Add in Rules", run: () => b.setPanel("rules") };
    case "look":
      return { label: "Pick a look", run: () => b.setDock("theme") };
    case "pages":
      return { label: "Add sections", run: () => b.setDock("insert") };
    case "publish":
      return { label: "Release", run: () => b.setPanel("publish") };
    case "portal":
      return { label: "Share", href: `/portals?${new URLSearchParams({ new: b.view.brand.slug })}` };
  }
}

/**
 * The launch checklist (lib/readiness.ts, read through b.status), then what
 * keeps the page on show from looking designed (lib/pages.ts
 * designWarnings) and theme pairs that fail contrast. The bar shows how many
 * steps are done, and a count of the page's own checks. Picking a check
 * selects its section and scrolls to it; a step opens where it is done.
 */
function Checklist({ b }: { b: BuilderApi }) {
  const sections = b.view.page?.sections ?? [];
  const found = [
    ...designWarnings(sections, {
      opens: b.view.page?.home,
      alternate: b.view.theme.grounds === "alternate",
      pictured: (s) => hasPicture(s) || boundKeys(s).some((k) => b.view.rules.some((r) => r.key === k && r.assets.length)),
    }).map((w) => ({ id: w.at === null ? null : sections[w.at].id, where: w.at === null ? "This page" : (sections[w.at].title ?? `Section ${w.at + 1}`), text: w.text })),
    ...b.view.warnings.map((text) => ({ id: null, where: "Theme", text })),
  ];
  const status = b.status;
  const steps = status?.steps.filter((s) => s.done !== null) ?? [];
  const label = `Launch checklist${status ? `: ${status.done} of ${status.total} done` : ""}${found.length ? `, ${found.length} ${found.length === 1 ? "check" : "checks"} on this page` : ""}`;
  const go = (id: string) => {
    b.select({ section: id, rule: null });
    document.querySelector(`section[data-template][id$="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton variant="ghost" size="sm" label={label} className="relative gap-1.5 px-2">
          <IconListCheck />
          {status && (
            <span className="text-muted-foreground hidden text-xs tabular-nums @4xl/bar:inline">
              {status.done}/{status.total}
            </span>
          )}
          {found.length > 0 && (
            <span className="bg-warning text-background absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
              {found.length}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="app-tokens w-88 p-0">
        {status && (
          <section aria-labelledby="launch-title" className="grid gap-3 border-b p-3">
            <div className="grid gap-1.5">
              <p id="launch-title" className="flex items-baseline justify-between text-sm font-medium">
                {status.next ? "Launch checklist" : "Ready to share"}
                <span className="text-muted-foreground text-xs font-normal tabular-nums">
                  {status.done} of {status.total}
                </span>
              </p>
              <Progress value={(status.done / Math.max(status.total, 1)) * 100} className="h-1.5" aria-label="Steps done" />
            </div>
            <ol className="grid gap-0.5">
              {steps.map((s) => {
                const a = actionOf(b, s.id);
                const next = s.id === status.next;
                return (
                  <li key={s.id} className={cn("flex items-start gap-2 rounded-md px-1.5 py-1.5", next && "bg-muted")}>
                    {s.done ? (
                      <IconCircleCheckFilled aria-label="Done" className="text-success mt-0.5 size-4 shrink-0" />
                    ) : (
                      <IconCircle aria-label="To do" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    )}
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className={cn("text-sm", s.done && "text-muted-foreground")}>{s.title}</span>
                      {(!s.done || next) && <span className="text-muted-foreground text-xs">{s.detail}</span>}
                    </span>
                    {!s.done &&
                      (a.href ? (
                        <Button asChild size="xs" variant={next ? "default" : "outline"} className="shrink-0">
                          <Link href={a.href}>{a.label}</Link>
                        </Button>
                      ) : (
                        <Button size="xs" variant={next ? "default" : "outline"} className="shrink-0" onClick={a.run}>
                          {a.label}
                        </Button>
                      ))}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        <p className="px-3 pt-3 pb-1 text-sm font-medium">{found.length ? "On this page" : "Nothing to fix on this page"}</p>
        {found.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto pb-1">
            {found.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!f.id}
                  onClick={() => f.id && go(f.id)}
                  className="hover:enabled:bg-accent focus-visible:bg-accent grid w-full gap-0.5 px-3 py-2 text-start outline-none"
                >
                  <span className="text-muted-foreground truncate text-xs">{f.where}</span>
                  <span className="text-sm first-letter:uppercase">{f.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-3 pb-3 text-xs">The checks look for starter text left in, grounds that run together, a second cover and titles in capitals.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** How an agent reads these rules: the same rules, in the same order, resolved for the context shown. */
function brandReads(brand: string, context?: string) {
  return (origin: string) => {
    const q = new URLSearchParams({ brand, ...(context && { context }) });
    return [
      { label: "MCP tool", text: call("brand_rules", { brand, context }) },
      { label: "MCP resource", text: `artbucket://brands/${brand}/rules${context ? `/${context}` : ""}` },
      { label: "REST", text: curl(`${origin}/api/v1/brand/rules?${q}`) },
      { label: "Design tokens", text: curl(`${origin}${tokensPath({ slug: brand, name: brand }, context, "json")}`) },
    ];
  };
}
