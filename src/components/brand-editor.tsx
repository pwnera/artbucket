"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconBook,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconCopy,
  IconExternalLink,
  IconGripVertical,
  IconHash,
  IconLetterCase,
  IconHistory,
  IconLink,
  IconList,
  IconMessage,
  IconPalette,
  IconPencil,
  IconPlus,
  IconSearch,
  IconShape,
  IconTrash,
  IconTypography,
  IconVersions,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { call, curl, ForAgents } from "@/components/agent-access";
import { ThemeToggle } from "@/components/brand";
import { History } from "@/components/brand-history";
import { remember } from "@/components/sidebar-prefs";
import { brandHref, type BrandInfo } from "@/components/brand-switcher";
import { RenditionMenu, renditionLabel } from "@/components/rendition-menu";
import { copy, Editable, fontFiles, isFontAsset, Markdown, ReadOnly, RichText, ValueEditor } from "@/components/brand-values";
import { FontStyles, FontThumb, ImportFamily } from "@/components/font-preview";
import { send } from "@/components/collections";
import { Thumb, type Asset } from "@/components/gallery";
import { TokensDialog, tokensPath } from "@/components/tokens-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isFont, pickFace } from "@/lib/font";
import { camel, ESSENTIALS, keyFor, PRESETS, type Preset } from "@/lib/presets";
import {
  contextLabel,
  fontValue,
  listStyle,
  ruleContext,
  ruleLabel,
  section,
  type RuleAsset,
  type Rule,
  type RuleType,
} from "@/lib/rules";
import type { SidebarData } from "@/lib/sidebar";
import { ago, exact } from "@/lib/time";
import { kebab } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const label = ruleLabel;

/** The sections a brand usually has, in the order a reader wants them. Any other key prefix is a section too. */
const SECTIONS: Record<string, { title: string; icon: Icon; blurb: string }> = {
  color: { title: "Color", icon: IconPalette, blurb: "The palette, graded for contrast against white and black." },
  logo: { title: "Logo", icon: IconShape, blurb: "How the mark is used, and how it never is." },
  type: { title: "Typography", icon: IconTypography, blurb: "The faces, and the scale they are set in." },
  tone: { title: "Voice and tone", icon: IconMessage, blurb: "How the brand sounds when it writes." },
};
const ORDER = Object.keys(SECTIONS);
const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
const meta = (name: string) => SECTIONS[name] ?? { title: label(name), icon: IconBook, blurb: "" };

const TYPE_ICON: Record<RuleType, Icon> = {
  color: IconPalette,
  text: IconTypography,
  number: IconHash,
  list: IconList,
  font: IconLetterCase,
};

/** What the note under a rule is for, by section: an empty note says what to write. */
const USAGE_HINT: Record<string, string> = {
  color: "Where it goes: buttons, links, backgrounds",
  logo: "When this applies, and why",
  type: "Where each is used",
  tone: "An example, or why it matters",
};

const copyOf = ({ key, context, type, value, usage, assets }: Rule) => ({ key, context, type, value, usage, assets });

type Line = "before" | "after";

/** The rule in the panel: its key, and which of its variants. `named`: just made, so its name is up first. */
type Open = { key: string; id: string; named?: boolean };

/**
 * The guidelines, read like a document and edited a rule at a time: Edit
 * shows the handles and the add buttons, and a rule opens in a side panel
 * while the page previews it (Carbon's side-panel edit, Material's standard
 * side sheet). Each change is one call to /api/v1/brand/rules; the page holds
 * nothing the API doesn't.
 */
export function BrandEditor({
  brand,
  sidebar,
  initial,
  contexts: initialContexts,
  context,
}: {
  brand: BrandInfo;
  sidebar: SidebarData;
  initial: Rule[];
  contexts: string[];
  context?: string;
}) {
  const [rules, setRules] = useState(initial);
  const [contexts, setContexts] = useState(initialContexts);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  // A plain rule picked at the end of the page, waiting for a section to go in.
  const [draft, setDraft] = useState<Preset | null>(null);
  const [picking, setPicking] = useState<Rule | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; line: Line } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // Made on this visit: nothing reads their keys yet, so renaming them needs no warning.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<{ rule: Rule; key: string } | null>(null);
  // Bumped when a rename is called off, so the name field shows the old name again.
  const [resets, setResets] = useState(0);

  // Opening a brand's guidelines puts them at the top of Recents.
  useEffect(() => {
    remember({ kind: "brand", id: brand.slug, label: `${brand.name} guidelines`, href: brandHref(brand) });
  }, [brand]);

  // The rule being edited stays in view beside the panel.
  const openKey = open?.key;
  useEffect(() => {
    if (openKey) document.getElementById(`rule-${openKey}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openKey]);

  const [history, setHistory] = useState(false);
  const [tokens, setTokens] = useState(false);
  // Bumped after every change, so an open history shows it.
  const [edits, setEdits] = useState(0);
  /** This brand's rules endpoint; the default brand needs no ?brand. */
  const rulesUrl = (path = "", extra: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    if (!brand.default) q.set("brand", brand.slug);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/api/v1/brand/rules${path}${q.size ? `?${q}` : ""}`;
  };

  async function reload() {
    const res = await fetch(rulesUrl("", { context }), { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setRules(json.data);
    setContexts(json.contexts);
    setEdits((n) => n + 1);
  }

  async function patch(r: Rule, body: Partial<Pick<Rule, "value" | "usage" | "assets">>) {
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...body } : x)));
    const saved: Rule | null = await send("PATCH", `/api/v1/brand/rules/${r.id}`, body);
    // A refused edit puts back what the server has.
    if (saved) {
      setRules((rs) => rs.map((x) => (x.id === r.id ? saved : x)));
      setEdits((n) => n + 1);
    } else await reload();
  }

  async function create(body: Omit<Rule, "id">) {
    const made: Rule | null = await send("POST", rulesUrl(), body);
    if (!made) return null;
    setFresh((f) => new Set(f).add(made.id));
    await reload();
    return made;
  }

  const taken = new Set(rules.map((r) => r.key));
  // The first of each font key: what a type scale can be set in.
  const fonts = rules.filter((r, i) => r.type === "font" && rules.findIndex((x) => x.key === r.key) === i);

  /** Make a rule from a preset, named `name` in section `at`, and open it to make it yours. */
  async function fromPreset(p: Preset, at: string, name: string) {
    const key = keyFor(at, name, taken);
    if (!key) return void toast.error("Give it a name with a letter in it");
    const made = await create({ key, context: context ?? null, type: p.type, value: p.value, usage: p.usage ?? null, assets: [] });
    if (!made) return;
    setOpen({ key: made.key, id: made.id, named: !p.name });
    if (p.assets) setPicking(made);
  }

  /** Picked from a menu opened in section `at` (null: the end of the page). */
  function pick(p: Preset, at: string | null) {
    const home = p.section || at;
    if (!home) return setDraft(p);
    // A fixed rule exists once: picking it again opens it.
    const existing = p.name && rules.find((r) => r.key === keyFor(home, p.name!, new Set()));
    if (existing) return setOpen({ key: existing.key, id: existing.id });
    void fromPreset(p, home, p.name ?? p.suggest ?? p.label);
  }

  /** The empty page's one click: the rules most guidelines start with. */
  async function essentials() {
    const made = new Set(taken);
    for (const id of ESSENTIALS) {
      const p = PRESETS.find((x) => x.id === id)!;
      const key = keyFor(p.section, p.name!, made)!;
      made.add(key);
      const r: Rule | null = await send("POST", rulesUrl(), { key, type: p.type, value: p.value, usage: p.usage ?? null });
      if (r) setFresh((f) => new Set(f).add(r.id));
    }
    await reload();
    setEditing(true);
    toast.success("Added the essentials. Open any of them to make it yours.");
  }

  /** A new name renames the rule's key, and its context versions with it; one agents may read asks first. */
  function proposeRename(r: Rule, name: string) {
    const others = new Set([...taken].filter((k) => k !== r.key));
    const key = keyFor(section(r.key), name, others);
    if (!key || key === r.key) return setResets((n) => n + 1);
    if (rules.filter((x) => x.key === r.key).every((x) => fresh.has(x.id))) return void rename(r, key);
    setRenaming({ rule: r, key });
  }

  async function rename(r: Rule, key: string) {
    if (!(await send("PATCH", `/api/v1/brand/rules/${r.id}`, { key }))) return;
    setOpen((o) => o && { ...o, key });
    await reload();
  }

  async function remove(r: Rule) {
    if (!(await send("DELETE", `/api/v1/brand/rules/${r.id}`))) return;
    // The panel stays on the rule's other variants, if it has any.
    const rest = rules.find((x) => x.key === r.key && x.id !== r.id);
    if (open?.id === r.id) setOpen(rest ? { key: r.key, id: rest.id } : null);
    await reload();
    toast(`Deleted ${label(r.key)}${r.context ? ` for ${contextLabel(r.context)}` : ""}`, {
      action: { label: "Undo", onClick: () => void create(copyOf(r)) },
      duration: 8000,
    });
  }

  async function addVariant(r: Rule, c: string) {
    const made = await create({ ...copyOf(r), context: c });
    if (made) setOpen({ key: r.key, id: made.id });
  }

  /** Optimistic: the section redraws in the new order while the PUT goes out. */
  async function reorder(keys: string[]) {
    const at = new Map(keys.map((k, i) => [k, i]));
    setRules((rs) => {
      // A stable sort, so each key's default stays ahead of its versions.
      const moved = rs.filter((r) => at.has(r.key)).sort((a, b) => at.get(a.key)! - at.get(b.key)!);
      let i = 0;
      return rs.map((r) => (at.has(r.key) ? moved[i++] : r));
    });
    if (await send("PUT", rulesUrl("/order"), { keys })) setEdits((n) => n + 1);
    else await reload();
  }

  const sections = new Map<string, Rule[]>();
  for (const r of rules) sections.set(section(r.key), [...(sections.get(section(r.key)) ?? []), r]);
  const names = [...sections.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const scope = context ? ` for ${contextLabel(context)}` : "";
  /** A section's keys, in order: what moving a rule works within. A key's section is part of its name. */
  const keysIn = (name: string) => [...new Set((sections.get(name) ?? []).map((r) => r.key))];

  function moveTo(key: string, target: string, line: Line) {
    const keys = keysIn(section(key));
    if (key === target || section(target) !== section(key)) return;
    const rest = keys.filter((k) => k !== key);
    rest.splice(rest.indexOf(target) + (line === "after" ? 1 : 0), 0, key);
    if (rest.join() !== keys.join()) void reorder(rest);
  }

  // The contents in the sidebar follow the section you are reading.
  const order = names.join();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id.replace("section-", ""));
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const n of order.split(",")) {
      const el = document.getElementById(`section-${n}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [order]);

  const group = open ? rules.filter((r) => r.key === open.key) : [];
  const current = group.find((r) => r.id === open?.id) ?? group[0];
  const siblings = current ? keysIn(section(current.key)) : [];
  const at = current ? siblings.indexOf(current.key) : -1;

  return (
    <SidebarProvider>
      <AppSidebar
        me={sidebar.me}
        collections={sidebar.collections}
        brands={sidebar.brands}
        searches={sidebar.searches}
        reviewCount={sidebar.reviewCount}
        currentBrand={brand.slug}
      />
      {names.length > 1 && !current && <Toc names={names} active={active} />}

      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          {/* On a phone the cover says it; the header keeps its room for the controls. */}
          <Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
          <Breadcrumb brand={brand} section={active ? meta(active).title : undefined} />
          <div className="ml-auto flex items-center gap-2">
            <Edited brand={brand} edits={edits} />
            <Button
              variant="ghost"
              size="icon-sm"
              // A phone's header has room for the rest; its share sheet copies the link.
              className="hidden sm:inline-flex"
              aria-label="Copy a link to this page"
              title="Copy link"
              onClick={() => copy(window.location.href, "link")}
            >
              <IconLink />
            </Button>
            {contexts.length > 0 && <ContextPicker brand={brand} contexts={contexts} context={context} />}
            <Button variant="outline" size="sm" title="Colors, fonts and the type scale as code" onClick={() => setTokens(true)}>
              <IconCode />
              <span className="sr-only sm:not-sr-only">Tokens</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHistory(true)}>
              <IconHistory />
              <span className="sr-only sm:not-sr-only">History</span>
            </Button>
            <ForAgents
              about={`These rules as data, in this order${context ? `, resolved for ${contextLabel(context)}` : ", every variant included"}. Agents read them before making anything on-brand.`}
              reads={brandReads(brand, context)}
            />
            <Button
              variant={editing ? "default" : "outline"}
              size="sm"
              aria-pressed={editing}
              onClick={() => {
                setEditing((e) => !e);
                setOpen(null);
                setDraft(null);
              }}
            >
              {editing ? <IconCheck /> : <IconPencil />}
              <span className="sr-only sm:not-sr-only">{editing ? "Done" : "Edit"}</span>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main
          className={cn(
            "mx-auto w-full max-w-4xl space-y-16 px-4 pt-10 pb-32 sm:px-8 sm:pt-14",
            // Room for the panel: the page reflows beside it rather than under it.
            current && "lg:max-w-[90rem] lg:pr-[34rem]",
          )}
        >
          <TokensDialog brand={brand} context={context} open={tokens} onOpenChange={setTokens} />
          <History
            brand={brand}
            open={history}
            onOpenChange={setHistory}
            edits={edits}
            onRestored={() => void reload()}
          />
          <ReadOnly.Provider value={true}>
            <Hero brand={brand} rules={rules} context={context} />

            {!rules.length && !editing && (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconBook />
                  </EmptyMedia>
                  <EmptyTitle>Start your guidelines</EmptyTitle>
                  <EmptyDescription>
                    Add the rules most brands begin with (clear space, minimum size, logo don&apos;ts, a type scale,
                    voice, words to avoid) and edit them into yours.
                  </EmptyDescription>
                </EmptyHeader>
                <div className="flex gap-2">
                  <Button onClick={essentials}>
                    <IconPlus /> Add the essentials
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Start blank
                  </Button>
                </div>
              </Empty>
            )}

            {names.map((name) => (
              <section key={name} id={`section-${name}`} className="scroll-mt-20 space-y-1">
                <SectionHeader name={name} count={keysIn(name).length} />
                {keysIn(name).map((key) => (
                  <RuleView
                    key={key}
                    rules={sections.get(name)!.filter((r) => r.key === key)}
                    editing={editing}
                    selected={open?.key === key ? current?.id : undefined}
                    onEdit={(id) => setOpen({ key, id })}
                    line={over?.key === key && drag !== key ? over.line : null}
                    dragging={drag === key}
                    dnd={{
                      onDragStart: () => setDrag(key),
                      onDragEnd: () => {
                        setDrag(null);
                        setOver(null);
                      },
                      onDragOver: (e) => {
                        if (!drag || section(drag) !== name) return;
                        e.preventDefault();
                        const box = e.currentTarget.getBoundingClientRect();
                        const line = e.clientY > box.top + box.height / 2 ? "after" : "before";
                        if (over?.key !== key || over.line !== line) setOver({ key, line });
                      },
                      onDrop: (e) => {
                        e.preventDefault();
                        if (drag && over) moveTo(drag, key, over.line);
                        setDrag(null);
                        setOver(null);
                      },
                    }}
                  />
                ))}
                {editing && <AddLine label={`Add to ${meta(name).title}${scope}`} at={name} onPick={(p) => pick(p, name)} />}
              </section>
            ))}

            {editing && (
              <section className="space-y-1">
                {draft && (
                  <DraftLine
                    icon={IconBook}
                    initial=""
                    placeholder="Name the new section, e.g. Imagery"
                    hint={(v) => `A new section${camel(v) ? ` (${camel(v)})` : ""} for the ${draft.label.toLowerCase()}. Enter to add, Esc to cancel.`}
                    check={(v) => (camel(v) ? undefined : "Give it a name with a letter in it")}
                    onCancel={() => setDraft(null)}
                    onCommit={async (v) => {
                      await fromPreset(draft, camel(v), draft.name ?? draft.suggest ?? draft.label);
                      setDraft(null);
                    }}
                  />
                )}
                <AddLine
                  label={rules.length ? `Add a rule or a section${scope}` : `Add the first rule${scope}`}
                  at={null}
                  onPick={(p) => pick(p, null)}
                />
              </section>
            )}
          </ReadOnly.Provider>

          <Sheet open={!!current} modal={false} onOpenChange={(o) => !o && setOpen(null)}>
            <SheetContent
              className="w-full gap-0 p-0 sm:max-w-lg"
              // Under the header, so Done and the rest stay in reach.
              style={{ top: "3.5rem", height: "calc(100svh - 3.5rem)" }}
              // Focus stays where you clicked; a rule just made focuses its own name.
              onOpenAutoFocus={(e) => e.preventDefault()}
              // A standard side sheet: the page stays live beside it, and shows each change.
              onInteractOutside={(e) => e.preventDefault()}
              // Esc in a field puts the field back; only outside one does it close the panel.
              onEscapeKeyDown={(e) => {
                const el = document.activeElement;
                if (!(el instanceof HTMLElement) || !el.matches("input, textarea, [contenteditable=true]")) return;
                e.preventDefault();
                // The panel hears Esc before the rich editor can: leave the editor here, which saves it.
                if (el.isContentEditable) el.blur();
              }}
            >
              {current && (
                <RulePanel
                  key={current.key}
                  rules={group}
                  rule={current}
                  contexts={contexts}
                  fonts={fonts}
                  named={!!open?.named}
                  resets={resets}
                  canMove={[at > 0, at < siblings.length - 1]}
                  onSelect={(id) => setOpen({ key: current.key, id })}
                  onPatch={(body) => patch(current, body)}
                  onRename={(name) => proposeRename(current, name)}
                  onVariant={(c) => addVariant(current, c)}
                  onDelete={() => remove(current)}
                  onPickAssets={() => setPicking(current)}
                  onMove={(step) => moveTo(current.key, siblings[at + step], step > 0 ? "after" : "before")}
                />
              )}
            </SheetContent>
          </Sheet>

          <AlertDialog
            open={!!renaming}
            onOpenChange={(o) => {
              if (o) return;
              setRenaming(null);
              setResets((n) => n + 1);
            }}
          >
            {renaming && (
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rename {renaming.rule.key}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Agents, the API and design tokens know this rule as{" "}
                    <code className="font-mono">{renaming.rule.key}</code>
                    {["color", "number", "font"].includes(renaming.rule.type) && (
                      <>
                        {" "}
                        (CSS <code className="font-mono">--{kebab(renaming.rule.key)}</code>)
                      </>
                    )}
                    . It becomes <code className="font-mono">{renaming.key}</code>, with its variants, and anything
                    still asking for the old name stops finding it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep the name</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void rename(renaming.rule, renaming.key)}>Rename</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            )}
          </AlertDialog>

          {picking && (
            <AssetPicker
              rule={picking}
              onClose={() => setPicking(null)}
              onSave={async (assets) => {
                await patch(picking, { assets });
                setPicking(null);
              }}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}


// ---- page furniture ---------------------------------------------------------

/** Where you are, Notion style: the guidelines, this brand, the section you are reading. */
function Breadcrumb({ brand, section }: { brand: BrandInfo; section?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
        <li className="hidden md:block">
          <Link href="/brand" className="hover:text-foreground">
            Guidelines
          </Link>
        </li>
        <li aria-hidden className="hidden md:block">
          /
        </li>
        <li className="text-foreground truncate font-medium">
          <a href="#top" className="hover:underline">
            {brand.name}
          </a>
        </li>
        {section && (
          <>
            <li aria-hidden className="hidden sm:block">
              /
            </li>
            <li className="hidden truncate sm:block" aria-current="location">
              {section}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/** "Edited 2 hours ago by claude": the latest version, refreshed after every change here. */
function Edited({ brand, edits }: { brand: BrandInfo; edits: number }) {
  const [last, setLast] = useState<{ actor: string; updatedAt: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brands/${brand.slug}/versions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setLast(b?.data?.[0] ?? null));
    return () => {
      live = false;
    };
  }, [brand.slug, edits]);
  if (!last) return null;
  const who = last.actor === "web" ? "the web app" : last.actor === "artbucket" ? null : last.actor;
  return (
    <span className="text-muted-foreground hidden text-xs whitespace-nowrap xl:inline" title={exact(last.updatedAt)} suppressHydrationWarning>
      Edited {ago(last.updatedAt)}
      {who && ` by ${who}`}
    </span>
  );
}

/**
 * The page's contents, Notion style: a dash per section on the right edge,
 * the one you are reading drawn longer, names on hover. The sidebar stays the
 * app's; this is the page's.
 */
function Toc({ names, active }: { names: string[]; active: string | null }) {
  return (
    <nav
      aria-label="On this page"
      className="group/toc hover:bg-popover fixed top-1/3 right-3 z-20 hidden rounded-lg border border-transparent p-2 transition-colors hover:border-inherit hover:shadow-md lg:block"
    >
      <ul className="flex flex-col gap-1">
        {names.map((name) => {
          const on = active === name;
          return (
            <li key={name}>
              <a href={`#section-${name}`} className="flex items-center justify-end gap-3 py-1" aria-current={on ? "location" : undefined}>
                <span
                  className={cn(
                    "hidden text-sm whitespace-nowrap group-hover/toc:inline",
                    on ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {meta(name).title}
                </span>
                <span className={cn("h-0.5 rounded-full transition-all", on ? "bg-foreground w-5" : "bg-muted-foreground/40 w-3")} />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The brand's face, as a Notion page's icon: its logo when a logo rule points
 * at one, its initial otherwise.
 */
function BrandIcon({ brand, rules }: { brand: BrandInfo; rules: Rule[] }) {
  const logos = rules.filter((r) => section(r.key) === "logo" && r.assets.length);
  const named = logos.find((r) => /^logo\.(primary|mark|main|wordmark)$/.test(r.key)) ?? logos[0];
  const a = named?.assets.find((x) => !x.mime || x.mime.startsWith("image/"));
  // The logo stands on its own, like a page icon; only the initial gets a tile.
  return a ? (
    <span className="relative flex size-16 shrink-0">
      <Thumb src={`/a/${a.id}/w_64,f_webp`} alt={`${brand.name} logo`} className="rounded-2xl p-0" />
    </span>
  ) : (
    <span className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-2xl border text-2xl font-semibold">
      {brand.name[0]?.toUpperCase()}
    </span>
  );
}

function SectionHeader({ name, count }: { name: string; count: number }) {
  const { title, icon: I, blurb } = meta(name);
  return (
    <div className="mb-5 flex items-start gap-3 border-b pb-4">
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        <I className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {blurb && <p className="text-muted-foreground text-sm">{blurb}</p>}
      </div>
      <span className="text-muted-foreground pt-1 text-sm tabular-nums">
        {count} {count === 1 ? "rule" : "rules"}
      </span>
    </div>
  );
}

/** The cover: what this is, how much of it there is, and the palette at a glance. */
function Hero({ brand, rules, context }: { brand: BrandInfo; rules: Rule[]; context?: string }) {
  const keys = new Set(rules.map((r) => r.key)).size;
  const variants = rules.filter((r) => r.context).length;
  const assets = new Set(rules.flatMap((r) => r.assets.map((a) => a.id))).size;
  const updated = rules
    .map((r) => r.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  // One swatch per color; its variants are a click away on the rule.
  const colors = rules.filter((r, i) => r.type === "color" && rules.findIndex((x) => x.key === r.key) === i);
  const facts = [
    `${keys} ${keys === 1 ? "rule" : "rules"}`,
    variants && !context && `${variants} ${variants === 1 ? "variant" : "variants"}`,
    `${assets} ${assets === 1 ? "asset" : "assets"}`,
  ].filter(Boolean);

  return (
    <div id="top" className="scroll-mt-20 space-y-8">
      <div className="flex items-center gap-4">
        <BrandIcon brand={brand} rules={rules} />
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">{brand.name}</h1>
          <p className="text-muted-foreground text-sm">
            {brand.default ? "Default brand" : "Brand guidelines"}
            {context && ` · as they apply to ${contextLabel(context)}`}
            {facts.map((f) => ` · ${f}`)}
            {updated && (
              <span suppressHydrationWarning title={exact(updated)}>
                {` · updated ${ago(updated)}`}
              </span>
            )}
          </p>
        </div>
      </div>

      {colors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {colors.map((c) => (
            <a
              key={c.id}
              href={`#rule-${c.key}`}
              className="group/swatch bg-card hover:border-foreground/20 overflow-hidden rounded-xl border transition-colors"
            >
              <div
                className="h-16 border-b transition-[height] duration-200 group-hover/swatch:h-20"
                style={{ backgroundColor: c.value as string }}
              />
              <div className="space-y-0.5 px-3 py-2">
                <p className="text-sm font-medium">
                  {label(c.key)}
                  {c.context && <span className="text-muted-foreground font-normal"> · {contextLabel(c.context)}</span>}
                </p>
                <p className="text-muted-foreground font-mono text-xs uppercase">{c.value as string}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Which context the page shows: every rule and variant, or what one context resolves to. */
function ContextPicker({ brand, contexts, context }: { brand: BrandInfo; contexts: string[]; context?: string }) {
  const router = useRouter();
  return (
    <Select value={context ?? "*"} onValueChange={(v) => router.push(brandHref(brand, v === "*" ? undefined : v))}>
      <SelectTrigger size="sm" aria-label="Show the rules for a context" title="Show the rules as they apply in one context">
        <IconVersions />
        {/* On a phone, the icon: the header's room goes to Edit. */}
        <span className="hidden sm:inline">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="*">All contexts</SelectItem>
        {contexts.map((c) => (
          <SelectItem key={c} value={c}>
            {contextLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How an agent reads this page: the same rules, in the same order, resolved for the context shown. */
function brandReads(brand: BrandInfo, context?: string) {
  return (origin: string) => {
    const uri = brand.default ? "artbucket://brand/rules" : `artbucket://brands/${brand.slug}/rules`;
    const q = new URLSearchParams();
    if (!brand.default) q.set("brand", brand.slug);
    if (context) q.set("context", context);
    return [
      { label: "MCP tool", text: call("brand_rules", { brand: brand.default ? undefined : brand.slug, context }) },
      { label: "MCP resource", text: `${uri}${context ? `/${context}` : ""}` },
      { label: "REST", text: curl(`${origin}/api/v1/brand/rules${q.size ? `?${q}` : ""}`) },
      { label: "Design tokens", text: curl(`${origin}${tokensPath(brand, context, "json")}`) },
    ];
  };
}

// ---- rules ------------------------------------------------------------------

type Dnd = Pick<React.HTMLAttributes<HTMLDivElement>, "onDragStart" | "onDragEnd" | "onDragOver" | "onDrop">;

/** A rule's variants as a row of toggles: Default, Dark background. */
function Variants({ rules, current, onPick }: { rules: Rule[]; current: Rule; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Variants" className="flex flex-wrap gap-1">
      {rules.map((x) => (
        <button
          key={x.id}
          type="button"
          aria-pressed={x.id === current.id}
          onClick={() => onPick(x.id)}
          title={x.context ? `Only in ${x.context}` : "Everywhere without its own variant"}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs transition-colors",
            x.id === current.id ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {x.context ? contextLabel(x.context) : "Default"}
        </button>
      ))}
    </div>
  );
}

/**
 * A rule as the guidelines show it: its name, its value as a specimen, its
 * note and assets, and its variants a click apart. Editing adds a handle to
 * drag it by and a button that opens it in the panel.
 */
function RuleView({
  rules,
  editing,
  selected,
  onEdit,
  line,
  dragging,
  dnd: { onDragStart, onDragEnd, ...target },
}: {
  /** One key's rules: the default first, then its context variants. */
  rules: Rule[];
  editing: boolean;
  /** The variant open in the panel, which the page previews. */
  selected?: string;
  onEdit: (id: string) => void;
  line: Line | null;
  dragging: boolean;
  dnd: Dnd;
}) {
  const [shown, setShown] = useState(rules[0].id);
  const r = rules.find((x) => x.id === (selected ?? shown)) ?? rules[0];
  const block = useRef<HTMLDivElement>(null);
  const others = r.assets.filter((a) => !isFontAsset(a));
  return (
    <div
      ref={block}
      id={`rule-${r.key}`}
      {...(editing ? target : {})}
      className={cn(
        "group/block target:bg-primary/10 relative -mx-2 scroll-mt-20 space-y-2 rounded-lg px-2 py-3 transition-colors",
        editing && "hover:bg-muted/40 focus-within:bg-muted/40",
        selected && "bg-muted/40 ring-border ring-1",
        dragging && "opacity-40",
      )}
    >
      {line && (
        <div
          aria-hidden
          className={cn("bg-primary absolute inset-x-0 h-0.5 rounded-full", line === "before" ? "-top-0.5" : "-bottom-0.5")}
        />
      )}
      {editing && (
        // Drag by the handle, like a Notion block; the panel's arrows do the same from the keyboard.
        <div
          draggable
          aria-hidden
          title="Drag to move"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", r.key);
            if (block.current) e.dataTransfer.setDragImage(block.current, 16, 16);
            onDragStart?.(e);
          }}
          onDragEnd={onDragEnd}
          className="text-muted-foreground absolute top-3.5 -left-6 hidden cursor-grab opacity-0 transition-opacity group-hover/block:opacity-100 active:cursor-grabbing sm:block"
        >
          <IconGripVertical className="size-4" />
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-medium">
          {editing ? (
            <button type="button" onClick={() => onEdit(r.id)} className="hover:underline">
              {label(r.key)}
            </button>
          ) : (
            label(r.key)
          )}
        </h3>
        {rules.length > 1 ? (
          <Variants rules={rules} current={r} onPick={(id) => (selected ? onEdit(id) : setShown(id))} />
        ) : (
          r.context && (
            <Badge variant="secondary" title={`Only in ${r.context}`}>
              {contextLabel(r.context)}
            </Badge>
          )
        )}
        {editing && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground ml-auto self-center transition-opacity sm:opacity-0 sm:group-focus-within/block:opacity-100 sm:group-hover/block:opacity-100"
            aria-label={`Edit ${label(r.key)}`}
            onClick={() => onEdit(r.id)}
          >
            <IconPencil /> Edit
          </Button>
        )}
      </div>
      <ValueEditor rule={r} onSave={() => {}} />
      {r.usage && <Markdown text={r.usage} className="text-muted-foreground text-sm" />}
      {r.type === "font" && fontFiles(r).length > 0 && <FontStyles files={fontFiles(r)} />}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {others.map((a) => (
            <AssetTile key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {children}
    </div>
  );
}

/**
 * One rule, edited: its name (and the key agents know it by), its variants,
 * the value, the note, the assets. Everything saves as you leave it, and the
 * page beside it shows the change.
 */
function RulePanel({
  rules,
  rule: r,
  contexts,
  fonts,
  named,
  resets,
  canMove: [canUp, canDown],
  onSelect,
  onPatch,
  onRename,
  onVariant,
  onDelete,
  onPickAssets,
  onMove,
}: {
  rules: Rule[];
  rule: Rule;
  /** The brand's contexts: what a new variant is likely for. */
  contexts: string[];
  /** The brand's font rules, one per key: what a type scale can be set in. */
  fonts: Rule[];
  /** Just made with a placeholder name: the name field is up first. */
  named: boolean;
  resets: number;
  canMove: [boolean, boolean];
  onSelect: (id: string) => void;
  onPatch: (body: Partial<Pick<Rule, "value" | "usage" | "assets">>) => void;
  onRename: (name: string) => void;
  onVariant: (context: string) => Promise<void>;
  onDelete: () => void;
  onPickAssets: () => void;
  onMove: (step: -1 | 1) => void;
}) {
  const [adding, setAdding] = useState(false);
  const files = fontFiles(r);
  const others = r.assets.filter((a) => !isFontAsset(a));
  return (
    <>
      <SheetHeader className="gap-1 border-b pr-12">
        <SheetDescription className="text-xs">{meta(section(r.key)).title}</SheetDescription>
        <SheetTitle asChild>
          <div>
            <Editable
              key={`${r.key}:${resets}`}
              value={label(r.key)}
              label="Name"
              autoFocus={named}
              className="text-lg font-semibold"
              onSave={(v) => v && onRename(v)}
            />
          </div>
        </SheetTitle>
        <button
          type="button"
          onClick={() => copy(r.key, "key")}
          title="Agents and the API know the rule by this key. Click to copy"
          className="text-muted-foreground hover:text-foreground w-fit font-mono text-xs"
        >
          {r.key}
        </button>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
        {rules.length > 1 && <Variants rules={rules} current={r} onPick={onSelect} />}
        {!adding && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            title="A version of this rule for one context: agents working there get it instead"
            onClick={() => setAdding(true)}
          >
            <IconPlus /> {rules.length > 1 ? "Variant" : "Add a variant for a context"}
          </Button>
        )}
      </div>
      {adding && (
        <div className="border-b px-2 py-2">
          <DraftLine
            icon={IconVersions}
            initial=""
            placeholder="Where it differs, e.g. dark-background"
            options={contexts.filter((c) => !rules.some((x) => x.context === c))}
            hint="Agents working there get this variant instead. Enter to add, Esc to cancel."
            check={(v) => ruleContext.safeParse(v).error?.issues[0]?.message}
            onCancel={() => setAdding(false)}
            onCommit={async (c) => {
              await onVariant(c);
              setAdding(false);
            }}
          />
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <Part title={r.context ? `Value in ${contextLabel(r.context)}` : "Value"}>
          <ValueEditor key={r.id} rule={r} onSave={(value) => onPatch({ value })} />
          {r.type === "font" && files.length === 0 && (
            <ImportFamily
              family={fontValue(r.value).family}
              onImported={(family, ids) =>
                onPatch({
                  value: { ...fontValue(r.value), family },
                  assets: [...r.assets, ...ids.map((id) => ({ id, rendition: null }))],
                })
              }
            />
          )}
          {section(r.key) === "type" &&
            (r.type === "text" || (r.type === "list" && listStyle(r.key, r.value as (string | number)[]) === "scale")) && (
              <SetIn rule={r} fonts={fonts} onPatch={onPatch} />
            )}
        </Part>
        <Part title="Note">
          <RichText
            key={r.id}
            value={r.usage ?? ""}
            label="Note"
            placeholder={USAGE_HINT[section(r.key)] ?? "When and how to use it"}
            className="text-sm"
            onSave={(usage) => onPatch({ usage: usage || null })}
          />
        </Part>
        <Part title={r.type === "font" ? "Files" : "Assets"}>
          {files.length > 0 && (
            <FontStyles
              files={files}
              onRemove={(id) => onPatch({ assets: r.assets.filter((x) => x.id !== id) })}
              onAdd={onPickAssets}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {others.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onChange={(rendition) => onPatch({ assets: r.assets.map((x) => (x.id === a.id ? { ...x, rendition } : x)) })}
                onRemove={() => onPatch({ assets: r.assets.filter((x) => x.id !== a.id) })}
              />
            ))}
            <button
              type="button"
              onClick={onPickAssets}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex size-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs transition-colors"
            >
              <IconPlus className="size-5" />
              {r.type === "font" ? "Add files" : "Add assets"}
            </button>
          </div>
        </Part>
      </div>

      <SheetFooter className="flex-row items-center gap-1 border-t">
        <Button variant="ghost" size="icon-sm" disabled={!canUp} onClick={() => onMove(-1)} aria-label="Move up" title="Move up">
          <IconArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={!canDown} onClick={() => onMove(1)} aria-label="Move down" title="Move down">
          <IconArrowDown />
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={onDelete}>
          <IconTrash />
          {rules.length > 1 ? `Delete ${r.context ? contextLabel(r.context) : "default"}` : "Delete rule"}
        </Button>
      </SheetFooter>
    </>
  );
}


/**
 * Which of the brand's fonts a typography rule (a scale, a sentence) is set
 * in. The choice is the font rule's file at its weight, attached to the rule,
 * so an agent reading it gets the file to set it in.
 */
function SetIn({ rule: r, fonts, onPatch }: { rule: Rule; fonts: Rule[]; onPatch: (body: Pick<Rule, "assets">) => void }) {
  const current = r.assets.find(isFontAsset);
  const chosen = current && fonts.find((f) => f.assets.some((a) => a.id === current.id));
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      Set in
      <Select
        value={chosen?.key ?? (current ? "file" : "none")}
        onValueChange={(k) => {
          if (k === "file") return;
          const f = fonts.find((x) => x.key === k);
          const file = f && pickFace(fontFiles(f), fontValue(f.value).weight);
          onPatch({ assets: [...r.assets.filter((a) => !isFontAsset(a)), ...(file ? [{ id: file.id, rendition: null }] : [])] });
        }}
      >
        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="The font this rule is set in">
          <IconLetterCase />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">The page&apos;s font</SelectItem>
          {current && !chosen && <SelectItem value="file">{current.title || current.filename}</SelectItem>}
          {fonts.map((f) => (
            <SelectItem key={f.key} value={f.key} disabled={!fontFiles(f).length}>
              {label(f.key)} · {fontValue(f.value).family}
              {!fontFiles(f).length && " (no files yet)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * An asset on a rule: its thumbnail and the rendition the rule means. On the
 * page it opens the asset; in the panel, a menu changes the size, copies the
 * URL, or takes it off the rule.
 */
function AssetTile({
  asset: a,
  onChange,
  onRemove,
}: {
  asset: RuleAsset;
  /** Both left out: read only. */
  onChange?: (rendition: string | null) => void;
  onRemove?: () => void;
}) {
  const path = a.rendition ? `/a/${a.id}/${a.rendition}` : `/a/${a.id}`;
  const name = a.title || a.filename || "Asset";
  const tile =
    "bg-checker focus-visible:ring-ring/50 hover:border-foreground/30 relative block size-28 overflow-hidden rounded-lg border transition-colors outline-none focus-visible:ring-2";
  const face =
    a.mime && isFont(a.mime, a.filename ?? "") ? (
      <span className="absolute inset-0 flex items-center justify-center">
        <FontThumb id={a.id} className="text-4xl" />
      </span>
    ) : (
      <Thumb src={`/a/${a.id}/w_112,f_webp`} alt="" className="p-2" />
    );
  // What it is first; the size only when the rule means a particular one.
  const caption = (
    <>
      <span className="truncate text-center text-xs" title={a.filename ?? name}>
        {name}
      </span>
      {a.rendition && (
        <span className="text-muted-foreground truncate text-center text-xs" title={a.rendition}>
          {renditionLabel(a.rendition)}
        </span>
      )}
    </>
  );
  if (!onChange || !onRemove)
    return (
      <a href={path} target="_blank" rel="noreferrer" className="grid w-28 gap-0.5" title={`Open ${name}`}>
        <span className={tile}>{face}</span>
        {caption}
      </a>
    );
  return (
    <Popover>
      <div className="grid w-28 gap-0.5">
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${name}, ${renditionLabel(a.rendition)}. Change the size`} className={tile}>
            {face}
          </button>
        </PopoverTrigger>
        {caption}
      </div>
      <PopoverContent align="start" className="w-80 p-0">
        <RenditionMenu value={a.rendition} onChange={onChange} />
        <Separator />
        <div className="flex items-center gap-1 p-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={path} target="_blank" rel="noreferrer">
              <IconExternalLink /> Open
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => copy(new URL(path, window.location.origin).href, "URL")}>
            <IconCopy /> Copy URL
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={onRemove}>
            <IconTrash /> Remove
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- adding -----------------------------------------------------------------

/**
 * The faint "+ Add" line and its menu: named building blocks, searchable,
 * this section's first, the plain kinds last. What is picked opens in the panel.
 */
function AddLine({ label, at, onPick }: { label: string; at: string | null; onPick: (p: Preset) => void }) {
  const [open, setOpen] = useState(false);
  const groups = new Map<string, Preset[]>();
  for (const p of PRESETS) groups.set(p.section, [...(groups.get(p.section) ?? []), p]);
  const order = [...groups.keys()].sort(
    (a, b) => Number(b === at) - Number(a === at) || Number(a === "") - Number(b === "") || rank(a) - rank(b),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
        >
          <IconPlus className="size-4" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search: color, logo, avoid, scale..." />
          <CommandList className="max-h-80">
            <CommandEmpty>Nothing like that. Try a plain Text or List.</CommandEmpty>
            {order.map((g) => (
              <CommandGroup key={g || "basic"} heading={g ? meta(g).title : at ? `Plain, in ${meta(at).title}` : "Plain, in a new section"}>
                {groups.get(g)!.map((p) => {
                  const I = TYPE_ICON[p.type];
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.label} ${p.hint} ${g}`}
                      onSelect={() => {
                        setOpen(false);
                        onPick(p);
                      }}
                    >
                      <I />
                      <div className="min-w-0">
                        <div>{p.label}</div>
                        <div className="text-muted-foreground truncate text-xs">{p.hint}</div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A one-line prompt in the flow: a new section's name, a variant's context. */
function DraftLine({
  icon: I,
  initial,
  placeholder,
  hint,
  options,
  check,
  onCommit,
  onCancel,
}: {
  icon: Icon;
  initial: string;
  placeholder: string;
  /** Offered as you type. */
  options?: string[];
  hint: string | ((v: string) => string);
  check: (v: string) => string | undefined;
  onCommit: (v: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-muted/40 space-y-1 rounded-lg px-2 py-2">
      <div className="flex items-center gap-2">
        <I className="text-muted-foreground size-4 shrink-0" />
        <input
          autoFocus
          value={v}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!problem}
          list={options?.length ? "draft-options" : undefined}
          disabled={busy}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setV(e.target.value);
            setProblem(undefined);
          }}
          onBlur={() => !busy && (v === initial || !v.trim()) && onCancel()}
          onKeyDown={async (e) => {
            if (e.key === "Escape") return onCancel();
            if (e.key !== "Enter") return;
            e.preventDefault();
            const bad = check(v.trim());
            if (bad) return setProblem(bad);
            setBusy(true);
            await onCommit(v.trim());
            setBusy(false);
          }}
          className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {!!options?.length && (
          <datalist id="draft-options">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
      </div>
      <p className={cn("pl-6 text-xs", problem ? "text-destructive" : "text-muted-foreground")}>{problem ?? (typeof hint === "function" ? hint(v.trim()) : hint)}</p>
    </div>
  );
}

// ---- assets -----------------------------------------------------------------

/** Search the library and pick what a rule points at; order is the order you pick in. */
function AssetPicker({
  rule,
  onClose,
  onSave,
}: {
  rule: Rule;
  onClose: () => void;
  onSave: (assets: RuleAsset[]) => Promise<void>;
}) {
  // A font rule's files are named after the family, without its spaces: DMSans-Bold.ttf.
  const [q, setQ] = useState(rule.type === "font" ? fontValue(rule.value).family.replace(/ +/g, "") : "");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [picked, setPicked] = useState(rule.assets);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/assets?limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setResults(res.ok ? (await res.json()).data : []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (id: string) =>
    setPicked((p) => (p.some((x) => x.id === id) ? p.filter((x) => x.id !== id) : [...p, { id, rendition: null }]));
  const setRendition = (id: string, rendition: string | null) =>
    setPicked((p) => p.map((x) => (x.id === id ? { ...x, rendition } : x)));
  // What the rule and the search have shown: a file that isn't an image has no renditions to offer.
  const [mimes, setMimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(rule.assets.flatMap((a) => (a.mime ? [[a.id, a.mime]] : []))),
  );
  if (results?.some((a) => !(a.id in mimes))) setMimes((m) => ({ ...m, ...Object.fromEntries(results.map((a) => [a.id, a.mime])) }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule.type === "font" ? "Files" : "Assets"} for {label(rule.key)}</DialogTitle>
          <DialogDescription>
            {rule.type === "font"
              ? "The family's font files, one per style. Agents get each file's URL."
              : "The logo it governs, examples of it done right. Pick a size under each to say which one the rule means; agents get that exact URL."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library"
            className="pl-8"
          />
        </div>
        {picked.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Picked, in order">
            {picked.map(({ id, rendition }, i) => (
              <div key={id} className="grid w-20 shrink-0 gap-1">
                <div className="bg-checker relative size-20 overflow-hidden rounded-md border">
                  {mimes[id] && isFont(mimes[id], "") ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <FontThumb id={id} className="text-2xl" />
                    </span>
                  ) : (
                    <Thumb src={`/a/${id}/w_80,f_webp`} alt="" className="p-1" />
                  )}
                  <span className="bg-primary text-primary-foreground absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded-full text-[11px]">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Unpick"
                    onClick={() => toggle(id)}
                    className="bg-background/90 absolute top-0.5 right-0.5 rounded-full p-0.5 shadow-sm"
                  >
                    <IconX className="size-3" />
                  </button>
                </div>
                {mimes[id] && isFont(mimes[id], "") ? null : mimes[id] && !mimes[id].startsWith("image/") ? (
                  <span className="text-muted-foreground truncate text-center text-[11px]">Original</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="hover:bg-muted flex items-center justify-center gap-0.5 truncate rounded px-1 text-[11px] font-medium"
                        title="Which size the rule means"
                      >
                        <span className="truncate">{renditionLabel(rendition)}</span>
                        <IconChevronDown className="size-3 shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <RenditionMenu value={rendition} onChange={(r) => setRendition(id, r)} />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            ))}
          </div>
        )}
        {/* The scroll box and the grid are separate: square tiles in a height-capped grid squash into each other. */}
        <div className="-mx-1 max-h-[50vh] overflow-y-auto p-1">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results?.map((a) => {
              const n = picked.findIndex((x) => x.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={n >= 0}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "group bg-muted relative aspect-square overflow-hidden rounded-md border text-left",
                    n >= 0 && "ring-primary ring-2",
                  )}
                >
                  {a.mime.startsWith("image/") ? (
                    <Thumb src={`/a/${a.id}/w_160,f_webp`} alt={a.filename} />
                  ) : isFont(a.mime, a.filename) ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
                      <FontThumb id={a.id} className="text-3xl" />
                      <span className="text-muted-foreground w-full truncate text-center text-[11px]">{a.filename}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-2 text-center text-xs break-all">
                      {a.filename}
                    </span>
                  )}
                  {n >= 0 && (
                    <span className="bg-primary text-primary-foreground absolute top-1 left-1 flex size-5 items-center justify-center rounded-full text-xs">
                      {n + 1}
                    </span>
                  )}
                </button>
              );
            })}
            {results?.length === 0 && (
              <p className="text-muted-foreground col-span-full py-8 text-center text-sm">Nothing found.</p>
            )}
          </div>
        </div>
        <DialogFooter className="items-center">
          <span className="text-muted-foreground mr-auto text-sm">{picked.length} picked</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave(picked);
              setBusy(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
