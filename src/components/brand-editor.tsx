"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconBook,
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconGripVertical,
  IconHash,
  IconHistory,
  IconList,
  IconMessage,
  IconPalette,
  IconPhotoPlus,
  IconPlus,
  IconRobot,
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
import { History } from "@/components/brand-history";
import { brandHref, Brands, type BrandInfo } from "@/components/brand-switcher";
import { RenditionMenu, renditionLabel } from "@/components/rendition-menu";
import { CopyButton, copy, Editable, ValueEditor } from "@/components/brand-values";
import { send } from "@/components/collections";
import { Thumb, type Asset } from "@/components/gallery";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { inkOn } from "@/lib/color";
import { camel, ESSENTIALS, keyFor, PRESETS, type Preset } from "@/lib/presets";
import { ruleContext, ruleLabel, section, type RuleAsset, type Rule, type RuleType } from "@/lib/rules";
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

const TYPE_ICON: Record<RuleType, Icon> = { color: IconPalette, text: IconTypography, number: IconHash, list: IconList };

/** What the note under a rule is for, by section: an empty note says what to write. */
const USAGE_HINT: Record<string, string> = {
  color: "Where it goes: buttons, links, backgrounds",
  logo: "When this applies, and why",
  type: "Where each is used",
  tone: "An example, or why it matters",
};

const copyOf = ({ key, context, type, value, usage, assets }: Rule) => ({ key, context, type, value, usage, assets });

type Line = "before" | "after";

/**
 * A rule on its way in. Presets with a fixed name are made at once; the rest
 * ask for a name, and a basic block added outside any section asks for the
 * section first.
 */
type Draft =
  | { kind: "section"; preset: Preset }
  | { kind: "name"; preset: Preset; at: string }
  | { kind: "variant"; of: Rule };

/**
 * The guidelines as an editable document, Notion style: every value is edited
 * where it is shown and saved when you leave it. Each change is one call to
 * /api/v1/brand/rules; the page holds nothing the API doesn't.
 */
export function BrandEditor({
  brand,
  brands,
  initial,
  contexts: initialContexts,
  context,
}: {
  brand: BrandInfo;
  brands: BrandInfo[];
  initial: Rule[];
  contexts: string[];
  context?: string;
}) {
  const [rules, setRules] = useState(initial);
  const [contexts, setContexts] = useState(initialContexts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [picking, setPicking] = useState<Rule | null>(null);
  const [slash, setSlash] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; line: Line } | null>(null);
  const end = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // "/" anywhere outside a text box opens the menu at the end of the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        e.key !== "/" ||
        (t instanceof Element && t.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]"))
      )
        return;
      e.preventDefault();
      end.current?.scrollIntoView({ block: "center" });
      setSlash(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [history, setHistory] = useState(false);
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
    await reload();
    setFocus(made.id);
    return made;
  }

  const taken = new Set(rules.map((r) => r.key));

  /** Make a rule from a preset, named `name` in section `at`. */
  async function fromPreset(p: Preset, at: string, name: string) {
    const key = keyFor(at, name, taken);
    if (!key) {
      toast.error("Give it a name with a letter in it");
      return false;
    }
    const made = await create({ key, context: context ?? null, type: p.type, value: p.value, usage: p.usage ?? null, assets: [] });
    if (made && p.assets) setPicking(made);
    return !!made;
  }

  /** Picked from a menu opened in section `at` (null: the end of the page). */
  function pick(p: Preset, at: string | null) {
    const home = p.section || at;
    if (!home) return setDraft({ kind: "section", preset: p });
    if (p.name) {
      // A fixed rule exists once: picking it again goes to it.
      const key = keyFor(home, p.name, new Set());
      if (key && taken.has(key)) {
        document.getElementById(`rule-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return void toast(`${p.label} is already here`);
      }
      return void fromPreset(p, home, p.name);
    }
    setDraft({ kind: "name", preset: p, at: home });
  }

  /** The empty page's one click: the rules most guidelines start with. */
  async function essentials() {
    const made = new Set(taken);
    for (const id of ESSENTIALS) {
      const p = PRESETS.find((x) => x.id === id)!;
      const key = keyFor(p.section, p.name!, made)!;
      made.add(key);
      await send("POST", rulesUrl(), { key, type: p.type, value: p.value, usage: p.usage ?? null });
    }
    await reload();
    toast.success("Added the essentials. Click anything to make it yours.");
  }

  /** A new title renames the rule's key, and its context versions with it. */
  async function rename(r: Rule, name: string) {
    const others = new Set([...taken].filter((k) => k !== r.key));
    const key = keyFor(section(r.key), name, others);
    if (!key || key === r.key) return;
    if (await send("PATCH", `/api/v1/brand/rules/${r.id}`, { key })) await reload();
  }

  async function remove(r: Rule) {
    if (!(await send("DELETE", `/api/v1/brand/rules/${r.id}`))) return;
    await reload();
    toast(`Deleted ${r.key}${r.context ? ` for ${r.context}` : ""}`, {
      action: { label: "Undo", onClick: () => void create(copyOf(r)) },
      duration: 8000,
    });
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
  const scope = context ? ` for ${context}` : "";

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

  const draftRow = (at: string | null) => {
    if (draft?.kind === "section" && at === null) {
      const { preset } = draft;
      return (
        <DraftLine
          key="section"
          icon={IconBook}
          initial=""
          placeholder="Name the new section, e.g. Imagery"
          hint={(v) => `A new section${camel(v) ? ` (${camel(v)})` : ""}. Enter to go on to the ${preset.label.toLowerCase()}, Esc to cancel.`}
          check={(v) => (camel(v) ? undefined : "Give it a name with a letter in it")}
          onCancel={() => setDraft(null)}
          onCommit={async (v) => setDraft({ kind: "name", preset, at: camel(v) })}
        />
      );
    }
    if (draft?.kind !== "name" || (draft.at !== at && !(at === null && !sections.has(draft.at)))) return null;
    const { preset, at: home } = draft;
    return (
      <DraftLine
        key={`name-${home}`}
        icon={TYPE_ICON[preset.type]}
        initial={preset.suggest ?? ""}
        placeholder="Name it"
        hint={(v) => {
          const key = keyFor(home, v, taken);
          return `${key ? `Saved as ${key}` : "Type a name"}${scope}. Enter to add, Esc to cancel.`;
        }}
        check={(v) => (keyFor(home, v, taken) ? undefined : "Give it a name with a letter in it")}
        onCancel={() => setDraft(null)}
        onCommit={async (name) => {
          if (await fromPreset(preset, home, name)) setDraft(null);
        }}
      />
    );
  };

  return (
    <SidebarProvider>
      <AppSidebar place="brand">
        <Brands brands={brands} current={brand.slug} />
        {names.length > 0 && (
          <Contents names={names} counts={sections} active={active} />
        )}
      </AppSidebar>

      <SidebarInset>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          {/* On a phone the cover says it; the header keeps its room for the controls. */}
          <Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
          <span className="hidden truncate text-sm font-semibold sm:inline">{brand.name}</span>
          <div className="ml-auto flex items-center gap-2">
            {contexts.length > 0 && <ContextPicker brand={brand} contexts={contexts} context={context} />}
            <Button variant="outline" size="sm" onClick={() => setHistory(true)}>
              <IconHistory />
              <span className="hidden sm:inline">History</span>
            </Button>
            <ForAgents brand={brand} context={context} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl space-y-16 px-4 pt-10 pb-32 sm:px-8 sm:pt-14">
          <History
            brand={brand}
            open={history}
            onOpenChange={setHistory}
            edits={edits}
            onRestored={() => void reload()}
          />
          <Hero brand={brand} rules={rules} context={context} />

          {!rules.length && !draft && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBook />
                </EmptyMedia>
                <EmptyTitle>Start your guidelines</EmptyTitle>
                <EmptyDescription>
                  Add the rules most brands begin with (clear space, minimum size, logo don&apos;ts, a type scale,
                  voice, words to avoid) and edit them into yours. Or press{" "}
                  <kbd className="bg-muted rounded px-1 font-mono text-xs">/</kbd> to pick one at a time.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={essentials}>
                <IconPlus /> Add the essentials
              </Button>
            </Empty>
          )}

      {names.map((name) => {
        const inSection = sections.get(name)!;
        const keys = [...new Set(inSection.map((r) => r.key))];
        const moveTo = (key: string, target: string, line: Line) => {
          if (key === target) return;
          const rest = keys.filter((k) => k !== key);
          rest.splice(rest.indexOf(target) + (line === "after" ? 1 : 0), 0, key);
          if (rest.join() !== keys.join()) void reorder(rest);
        };
        return (
          <section key={name} id={`section-${name}`} className="scroll-mt-20 space-y-1">
            <SectionHeader name={name} count={keys.length} />
            {inSection.map((r, n) => (
              <Block
                key={r.id}
                rule={r}
                anchor={inSection.findIndex((x) => x.key === r.key) === n}
                autoFocus={focus === r.id}
                line={over?.id === r.id && drag !== r.key ? over.line : null}
                dragging={drag === r.key}
                onMove={(step) => {
                  const to = keys[keys.indexOf(r.key) + step];
                  if (to) moveTo(r.key, to, step > 0 ? "after" : "before");
                }}
                canMove={[keys.indexOf(r.key) > 0, keys.indexOf(r.key) < keys.length - 1]}
                dnd={{
                  onDragStart: () => setDrag(r.key),
                  onDragEnd: () => {
                    setDrag(null);
                    setOver(null);
                  },
                  // Rules move within their section: a key's section is part of its name.
                  onDragOver: (e) => {
                    if (!drag || section(drag) !== name) return;
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    const line = e.clientY > box.top + box.height / 2 ? "after" : "before";
                    if (over?.id !== r.id || over.line !== line) setOver({ id: r.id, line });
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    if (drag && over) moveTo(drag, r.key, over.line);
                    setDrag(null);
                    setOver(null);
                  },
                }}
                onPatch={(body) => patch(r, body)}
                onDelete={() => remove(r)}
                onVariant={() => setDraft({ kind: "variant", of: r })}
                onPickAssets={() => setPicking(r)}
                onRename={(v) => rename(r, v)}
              >
                {draft?.kind === "variant" && draft.of.id === r.id && (
                  <DraftLine
                    icon={IconVersions}
                    initial=""
                    placeholder="context, e.g. dark-background"
                    hint={`A version of ${r.key} for one context. Enter to add, Esc to cancel.`}
                    check={(v) => ruleContext.safeParse(v).error?.issues[0]?.message}
                    onCancel={() => setDraft(null)}
                    onCommit={async (c) => {
                      if (await create({ ...copyOf(r), context: c })) setDraft(null);
                    }}
                  />
                )}
              </Block>
            ))}
            {draftRow(name)}
            <AddLine label={`Add to ${meta(name).title}${scope}`} at={name} onPick={(p) => pick(p, name)} />
          </section>
        );
      })}

      <section ref={end} className="space-y-1">
        {draftRow(null)}
        <AddLine
          label={rules.length ? `Add a rule or a section${scope}` : `Add the first rule${scope}`}
          shortcut
          open={slash}
          onOpenChange={setSlash}
          at={null}
          onPick={(p) => pick(p, null)}
        />
      </section>

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

/** The sidebar's table of contents, following the scroll. */
function Contents({ names, counts, active }: { names: string[]; counts: Map<string, Rule[]>; active: string | null }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>On this page</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {names.map((name) => {
            const { title, icon: I } = meta(name);
            return (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton asChild isActive={active === name} tooltip={title}>
                  <a href={`#section-${name}`} onClick={() => setOpenMobile(false)}>
                    <I /> <span>{title}</span>
                  </a>
                </SidebarMenuButton>
                <SidebarMenuBadge>{new Set(counts.get(name)!.map((r) => r.key)).size}</SidebarMenuBadge>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
  const versions = rules.filter((r) => r.context).length;
  const assets = new Set(rules.flatMap((r) => r.assets.map((a) => a.id))).size;
  const updated = rules
    .map((r) => r.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const colors = rules.filter((r) => r.type === "color");
  const stats: [number | string, string][] = [
    [keys, keys === 1 ? "rule" : "rules"],
    ...(versions && !context ? [[versions, versions === 1 ? "context version" : "context versions"] as [number, string]] : []),
    [assets, assets === 1 ? "asset" : "assets"],
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-primary text-sm font-medium">
          Brand guidelines{brand.default && " · the default brand"}
          {context && ` · as they apply to ${context}`}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{brand.name}</h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          Every rule on this page is data. Agents read exactly this over the API and MCP, so a change here is a change
          everywhere, at once.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {stats.map(([n, what]) => (
          <div key={what} className="flex flex-col-reverse">
            <dt className="text-muted-foreground text-sm">{what}</dt>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums">{n}</dd>
          </div>
        ))}
        {updated && (
          <div className="flex flex-col-reverse">
            <dt className="text-muted-foreground text-sm">last change</dt>
            <dd className="text-3xl font-semibold tracking-tight" suppressHydrationWarning>
              {new Date(updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </dd>
          </div>
        )}
      </dl>

      {colors.length > 0 && (
        <div className="flex h-28 overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/10 dark:ring-white/10">
          {colors.map((c) => (
            <a
              key={c.id}
              href={`#rule-${c.key}`}
              style={{ backgroundColor: c.value as string, color: inkOn((c.value as string).slice(0, 7)) }}
              className="flex min-w-0 flex-1 flex-col justify-end p-3 text-xs transition-[flex-grow] duration-300 hover:flex-[1.8]"
            >
              <span className="truncate font-medium">
                {label(c.key)}
                {c.context && <span className="opacity-70"> · {c.context}</span>}
              </span>
              <span className="truncate font-mono opacity-80">{c.value as string}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Which context the page shows: every rule and version, or what one context resolves to. */
function ContextPicker({ brand, contexts, context }: { brand: BrandInfo; contexts: string[]; context?: string }) {
  const router = useRouter();
  return (
    <Select value={context ?? "*"} onValueChange={(v) => router.push(brandHref(brand, v === "*" ? undefined : v))}>
      <SelectTrigger size="sm" aria-label="Context">
        <IconVersions />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="*">Every context</SelectItem>
        {contexts.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How an agent gets what this page shows. */
function ForAgents({ brand, context }: { brand: BrandInfo; context?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <IconRobot />
          <span className="hidden sm:inline">For agents</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Agents read these rules as data</p>
          <p className="text-muted-foreground text-xs">
            The same rules, in the same order, over MCP (the brand_rules tool and resources) or REST.
            {context && ` These resolve for ${context}.`}
          </p>
        </div>
        <Snippets brand={brand} context={context} />
      </PopoverContent>
    </Popover>
  );
}

/** Mounted only while the popover is open, so reading the page's origin is safe. */
function Snippets({ brand, context }: { brand: BrandInfo; context?: string }) {
  const origin = window.location.origin;
  const uri = brand.default ? "artbucket://brand/rules" : `artbucket://brands/${brand.slug}/rules`;
  const q = new URLSearchParams();
  if (!brand.default) q.set("brand", brand.slug);
  if (context) q.set("context", context);
  const rows = [
    ["MCP resource", `${uri}${context ? `/${context}` : ""}`],
    ["REST", `curl '${origin}/api/v1/brand/rules${q.size ? `?${q}` : ""}'`],
    ["Connect Claude Code", `claude mcp add --transport http artbucket ${origin}/api/v1/mcp`],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([what, text]) => (
        <div key={what} className="space-y-1">
          <p className="text-muted-foreground text-xs">{what}</p>
          <div className="bg-muted flex items-center gap-2 rounded-md py-1 pr-1 pl-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs" title={text}>
              {text}
            </code>
            <CopyButton onClick={() => copy(text, what)} label={`Copy ${what}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- blocks -----------------------------------------------------------------

type Dnd = Pick<React.HTMLAttributes<HTMLDivElement>, "onDragStart" | "onDragEnd" | "onDragOver" | "onDrop">;

function Block({
  rule: r,
  anchor,
  autoFocus,
  line,
  dragging,
  dnd: { onDragStart, onDragEnd, ...target },
  onMove,
  canMove: [canUp, canDown],
  onPatch,
  onDelete,
  onVariant,
  onPickAssets,
  onRename,
  children,
}: {
  rule: Rule;
  /** The first block of its key: the one /brand#rule-{key} scrolls to. */
  anchor: boolean;
  autoFocus: boolean;
  line: Line | null;
  dragging: boolean;
  dnd: Dnd;
  onMove: (step: -1 | 1) => void;
  canMove: [boolean, boolean];
  onPatch: (body: Partial<Pick<Rule, "value" | "usage" | "assets">>) => void;
  onDelete: () => void;
  onVariant: () => void;
  onPickAssets: () => void;
  onRename: (name: string) => void;
  children?: React.ReactNode;
}) {
  // A menu traps focus while open; run the chosen action once it has closed,
  // so the line or dialog it opens can take focus.
  const after = useRef<() => void>(undefined);
  const block = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  return (
    <div
      ref={block}
      id={anchor ? `rule-${r.key}` : undefined}
      {...target}
      className={cn(
        "group/block hover:bg-muted/40 focus-within:bg-muted/40 target:bg-primary/10 relative flex scroll-mt-20 gap-1 rounded-lg py-2 pr-2 transition-colors",
        dragging && "opacity-40",
      )}
    >
      {line && (
        <div
          aria-hidden
          className={cn(
            "bg-primary absolute inset-x-0 h-0.5 rounded-full",
            line === "before" ? "-top-0.5" : "-bottom-0.5",
          )}
        />
      )}
      {/* The handle, Notion style: drag it to move the rule, click it for the menu. */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", r.key);
          if (block.current) e.dataTransfer.setDragImage(block.current, 16, 16);
          onDragStart?.(e);
        }}
        onDragEnd={onDragEnd}
        className="cursor-grab pt-0.5 opacity-100 transition-opacity active:cursor-grabbing sm:opacity-0 sm:group-focus-within/block:opacity-100 sm:group-hover/block:opacity-100"
      >
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground size-6 cursor-[inherit]"
              aria-label={`${r.key} actions`}
              title="Drag to move, click for more"
              // The menu opens on click, not on press, so pressing can start a drag.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setMenu(true)}
            >
              <IconGripVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(e) => {
              if (!after.current) return;
              e.preventDefault();
              after.current();
              after.current = undefined;
            }}
          >
            <DropdownMenuItem onSelect={() => void (after.current = onPickAssets)}>
              <IconPhotoPlus /> Assets…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void (after.current = onVariant)}>
              <IconVersions /> Add a version for a context
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(r.key)}>
              <IconCopy /> Copy key
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canUp} onSelect={() => onMove(-1)}>
              <IconArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canDown} onSelect={() => onMove(1)}>
              <IconArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void (after.current = onDelete)}>
              <IconTrash /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <h3 className="min-w-0">
            <Editable
              value={label(r.key)}
              label={`Rename ${r.key}`}
              className="text-base font-medium"
              onSave={(v) => v && onRename(v)}
            />
          </h3>
          {r.context && <Badge variant="secondary">{r.context}</Badge>}
          <code className="text-muted-foreground ml-auto truncate font-mono text-xs">{r.key}</code>
        </div>
        <ValueEditor rule={r} autoFocus={autoFocus} onSave={(value) => onPatch({ value })} />
        <Editable
          value={r.usage ?? ""}
          placeholder={USAGE_HINT[section(r.key)] ?? "Add a note on when and how to use it"}
          multiline
          className="text-muted-foreground text-sm"
          onSave={(usage) => onPatch({ usage: usage || null })}
        />
        {r.assets.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {r.assets.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onChange={(rendition) =>
                  onPatch({ assets: r.assets.map((x) => (x.id === a.id ? { ...x, rendition } : x)) })
                }
                onRemove={() => onPatch({ assets: r.assets.filter((x) => x.id !== a.id) })}
              />
            ))}
            <button
              type="button"
              onClick={onPickAssets}
              aria-label="Add assets"
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex size-28 items-center justify-center rounded-lg border border-dashed transition-colors"
            >
              <IconPlus className="size-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * An asset on a rule: its thumbnail, the rendition the rule means, and a
 * menu to change it, open it, copy its URL, or take it off the rule.
 */
function AssetTile({
  asset: a,
  onChange,
  onRemove,
}: {
  asset: RuleAsset;
  onChange: (rendition: string | null) => void;
  onRemove: () => void;
}) {
  const path = a.rendition ? `/a/${a.id}/${a.rendition}` : `/a/${a.id}`;
  return (
    <Popover>
      <div className="grid w-28 gap-1">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Asset, ${renditionLabel(a.rendition)}. Change the rendition`}
            className="bg-checker focus-visible:ring-ring/50 hover:border-foreground/30 relative size-28 overflow-hidden rounded-lg border transition-colors outline-none focus-visible:ring-2"
          >
            <Thumb src={`/a/${a.id}/w_320,f_webp`} alt="" className="p-2" />
          </button>
        </PopoverTrigger>
        <span className="text-muted-foreground truncate text-center text-xs" title={a.rendition ?? "The original"}>
          {renditionLabel(a.rendition)}
        </span>
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
 * The faint "+ Add" line and its menu, like Notion's "/": named building
 * blocks, searchable, this section's first, the plain kinds last.
 */
function AddLine({
  label,
  at,
  shortcut,
  open,
  onOpenChange,
  onPick,
}: {
  label: string;
  at: string | null;
  shortcut?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPick: (p: Preset) => void;
}) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const groups = new Map<string, Preset[]>();
  for (const p of PRESETS) groups.set(p.section, [...(groups.get(p.section) ?? []), p]);
  const order = [...groups.keys()].sort(
    (a, b) => Number(b === at) - Number(a === at) || Number(a === "") - Number(b === "") || rank(a) - rank(b),
  );
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
        >
          <IconPlus className="size-4" />
          {label}
          {shortcut && (
            <span className="ml-auto text-xs">
              or press <kbd className="bg-muted rounded px-1 font-mono">/</kbd>
            </span>
          )}
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

/** A one-line prompt in the flow of the page: a new rule's key, a variant's context. */
function DraftLine({
  icon: I,
  initial,
  placeholder,
  hint,
  check,
  onCommit,
  onCancel,
}: {
  icon: Icon;
  initial: string;
  placeholder: string;
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
  const [q, setQ] = useState("");
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
  // What the search has shown: a file that isn't an image has no renditions to offer.
  const [mimes, setMimes] = useState<Record<string, string>>({});
  if (results?.some((a) => !(a.id in mimes))) setMimes((m) => ({ ...m, ...Object.fromEntries(results.map((a) => [a.id, a.mime])) }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assets for {label(rule.key)}</DialogTitle>
          <DialogDescription>
            The logo it governs, examples of it done right. Pick a rendition under each to say which size the rule
            means; agents get that exact URL.
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
                  <Thumb src={`/a/${id}/w_240,f_webp`} alt="" className="p-1" />
                  <span className="bg-primary text-primary-foreground absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded-full text-[10px]">
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
                {mimes[id] && !mimes[id].startsWith("image/") ? (
                  <span className="text-muted-foreground truncate text-center text-[11px]">Original</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="hover:bg-muted flex items-center justify-center gap-0.5 truncate rounded px-1 text-[11px] font-medium"
                        title="Which rendition the rule means"
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
                    <Thumb src={`/a/${a.id}/w_240,f_webp`} alt={a.filename} />
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
