"use client";

import { useId, useState } from "react";
import { IconArrowLeft, IconArrowUp, IconBrandGit, IconCheck, IconFile, IconFolder, IconPlus, IconSparkles, IconWorld } from "@tabler/icons-react";
import { SetupPart, Snippet } from "@/components/agent-access";
import { AGENTS } from "@/components/agent-catalog";
import type { BrandInfo } from "@/components/brand-switcher";
import { useMe } from "@/components/can";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TEMPLATE_CARDS } from "@/lib/brand-templates";
import { gitLink } from "@/lib/git";
import { sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

type Step = "how" | "builder" | "agent" | "git";
type Start = "" | "domain" | (typeof TEMPLATE_CARDS)[number]["id"];
/** GET /api/v1/brand-json: what a domain's brand.json holds. */
type Found = {
  domain: string | null;
  pick: string | null;
  brands: { id: string; name: string; domain: string | null; tagline: string | null; colors: string[]; fonts: string[]; logos: number; rules: number; dropped: string[] }[];
};

/** The agents the AI path offers, in the order people reach for them: each connects as the Connections page says. */
const PICKS = ["Claude Code", "Cursor", "Codex", "Claude", "ChatGPT"].flatMap((n) => AGENTS.filter((a) => a.name === n));

/** What the agent is asked to do: the brand_status and playbook path every agent is pointed at. */
const brief = (name: string, site: string) =>
  [
    `Build the brand guidelines for ${name.trim() || "our brand"} in artbucket${site.trim() ? `. The brand's website: ${site.trim()}` : ""}.`,
    "",
    `1. create_brand named "${name.trim() || "Our brand"}", then brand_status with its slug, and read brand_playbook before the first page.`,
    `2. Find the brand's real colors, typefaces, logo and voice${site.trim() ? " on its website" : ""}. Ingest the logo, import the Google fonts, and write them with set_rules, each with a label and a usage line.`,
    "3. Pick a look with set_theme, then lay out the pages with save_page, checking each with get_page.",
    "",
    "Leave it as a draft: don't publish, I'll review it first.",
  ].join("\n");

/**
 * A new brand, three ways: laid out by hand in the builder (from nothing, or
 * from a showcase brand to edit), by an agent, given the one prompt to paste
 * once it is connected, or from a Git repository (brand as code): where the
 * server has a Git integration (me.git, GIT_CONNECT_URL), brought in from
 * files already there or made here and kept there as it grows; elsewhere,
 * made here and pushed from the repository with the CLI (artbucket brand push).
 */
export function NewBrand({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (b: BrandInfo) => void }) {
  const id = useId();
  const git = useMe()?.git ?? null;
  const [step, setStep] = useState<Step>("how");
  const [how, setHow] = useState<"builder" | "agent" | "git">("builder");
  // Made here, then kept in a repository: the integration takes over once it exists.
  const [keep, setKeep] = useState(false);
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [start, setStart] = useState<Start>("");
  const [busy, setBusy] = useState(false);
  // From a domain: what its brand.json holds, the brand picked, and why nothing was found.
  const [domain, setDomain] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [pickId, setPickId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  /** Made for the CLI, where the server has no Git integration: the commands name it. */
  const [made, setMade] = useState<BrandInfo | null>(null);

  // A template, or the brand found at a domain, names the brand until you do.
  const nameOf = (s: Start, id = pickId) => (s === "domain" ? found?.brands.find((b) => b.id === id)?.name : TEMPLATE_CARDS.find((t) => t.id === s)?.name) ?? "";
  const rename = (next: string) => {
    if (!name.trim() || name === nameOf(start)) setName(next);
  };

  function pick(s: Start) {
    rename(nameOf(s));
    setStart(s);
  }

  async function look(e?: React.FormEvent) {
    e?.preventDefault();
    if (!domain.trim()) return;
    setLookup({ busy: true, error: null });
    const r = await sendResult("GET", `/api/v1/brand-json?${new URLSearchParams({ domain: domain.trim() })}`, undefined, { quiet: true });
    if (!r.ok) {
      setFound(null);
      return setLookup({ busy: false, error: r.network ? "Couldn't reach the server" : (r.error?.message ?? "Nothing found") });
    }
    const f = r.data as Found;
    const id = f.pick ?? f.brands[0]?.id ?? null;
    setLookup({ busy: false, error: null });
    rename(f.brands.find((b) => b.id === id)?.name ?? "");
    setFound(f);
    setPickId(id);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const from = start === "domain" ? { domain: found?.domain ?? domain.trim(), ...(pickId && { brand: pickId }) } : start ? { template: start } : {};
    const b: BrandInfo | null = await send("POST", "/api/v1/brands", { name, ...from });
    if (b && git && keep) return window.location.assign(gitLink(git, b.slug));
    setBusy(false);
    if (b) onDone(b);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-3xl" guard={{ dirty: !!(name || site), onDiscard: onClose }}>
        {/* Each step slides in from the side it lies on: on from the end, Back from the start. */}
        <div
          key={step}
          className={cn("animate-in fade-in-0 grid min-w-0 gap-4 duration-200", step === "how" ? "slide-in-from-start-2" : "slide-in-from-end-2")}
        >
          {step === "how" && (
            <>
              <DialogHeader>
                <DialogTitle>New brand</DialogTitle>
                <DialogDescription>Choose how to set it up. Either way it is a draft until you release it.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How to set it up">
                <Choice selected={how === "builder"} onSelect={() => setHow("builder")} title="Build it in the builder" text="Lay out the pages yourself, from a blank brand or a template like Firefox, Rust or Blender.">
                  <BuilderArt />
                </Choice>
                <Choice selected={how === "agent"} onSelect={() => setHow("agent")} title="Start with an AI agent" text="Connect Claude, Cursor or Codex and it writes the rules and pages for you to review.">
                  <AgentArt />
                </Choice>
                <Choice selected={how === "git"} onSelect={() => setHow("git")} title="From a Git repository" text="Keep the brand as files in a repository: reviewed in pull requests, in step both ways.">
                  <FilesArt />
                </Choice>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => setStep(how)}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "builder" && (
            <form onSubmit={create} className="grid min-w-0 gap-4">
              <DialogHeader>
                <DialogTitle>Build it in the builder</DialogTitle>
                <DialogDescription>Start blank, from your domain&apos;s brand.json, or from a template: its colors, type, logos and pages, yours to change.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3" role="radiogroup" aria-label="Start from">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice selected={start === ""} onSelect={() => pick("")} title="Blank" text="No rules and no pages: add them as you go." compact>
                    <div className="text-muted-foreground flex h-10 items-center justify-center rounded-md border border-dashed">
                      <IconPlus className="size-4" />
                    </div>
                  </Choice>
                  <Choice selected={start === "domain"} onSelect={() => pick("domain")} title="From a domain" text="Its brand.json, the file agents read: colors, type, logos and voice." compact>
                    <div className="text-muted-foreground flex h-10 items-center justify-center gap-1.5 rounded-md border font-mono text-xs">
                      <IconWorld className="size-4" /> /.well-known/brand.json
                    </div>
                  </Choice>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {TEMPLATE_CARDS.map((t) => (
                    <Choice key={t.id} selected={start === t.id} onSelect={() => pick(t.id)} title={t.name} text={t.blurb} compact>
                      <div className="flex h-10 overflow-hidden rounded-md border">
                        {t.swatches.map((c) => (
                          <span key={c} className="flex-1" style={{ background: c }} />
                        ))}
                      </div>
                    </Choice>
                  ))}
                </div>
              </div>
              {start === "domain" && (
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-domain`}>Domain</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`${id}-domain`}
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void look(e)}
                      placeholder="acme.com"
                      inputMode="url"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <Button type="button" variant="outline" pending={lookup.busy} disabled={!domain.trim()} onClick={() => void look()}>
                      Look it up
                    </Button>
                  </div>
                  {lookup.error && (
                    <p className="text-destructive text-sm" role="alert">
                      {lookup.error}
                    </p>
                  )}
                  {found && (
                    <div className="animate-in fade-in-0 slide-in-from-top-1 grid gap-2 duration-150" role="radiogroup" aria-label="Brand found">
                      {found.brands.map((b) => (
                        <Choice
                          key={b.id}
                          selected={pickId === b.id}
                          onSelect={() => {
                            rename(b.name);
                            setPickId(b.id);
                          }}
                          title={b.name}
                          text={[
                            b.domain,
                            b.tagline,
                            `${b.rules} rules${b.logos ? `, ${b.logos} logo${b.logos === 1 ? "" : "s"}` : ""}${b.fonts.length ? `, ${b.fonts.join(" and ")}` : ""}`,
                            b.dropped.length ? `Left out: ${b.dropped.join(", ")}` : null,
                          ]
                            .filter(Boolean)
                            .join(". ")}
                          compact
                        >
                          {b.colors.length > 0 && (
                            <div className="flex h-6 overflow-hidden rounded-md border">
                              {b.colors.map((c, i) => (
                                <span key={i} className="flex-1" style={{ background: c }} />
                              ))}
                            </div>
                          )}
                        </Choice>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your brand" />
              </div>
              {git && (
                <div className="flex items-start gap-2.5">
                  <Checkbox id={`${id}-keep`} checked={keep} onCheckedChange={(v) => setKeep(v === true)} className="mt-0.5" />
                  <Label htmlFor={`${id}-keep`} className="grid gap-0.5 font-normal">
                    <span className="font-medium">Keep it in a Git repository too</span>
                    <span className="text-muted-foreground">Pick the repository next. Its files and this brand stay in step, both ways.</span>
                  </Label>
                </div>
              )}
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("how")} disabled={busy}>
                  <IconArrowLeft /> Back
                </Button>
                <Button type="submit" pending={busy && (start ? "beside" : true)} disabled={!name.trim() || (start === "domain" && !pickId)}>
                  {busy && start ? "Bringing in its logos and fonts" : keep ? "Create and pick a repository" : "Create brand"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step === "git" && git && (
            <div className="grid min-w-0 gap-4">
              <DialogHeader>
                <DialogTitle>From a Git repository</DialogTitle>
                <DialogDescription>
                  The brand as YAML beside its logos and fonts: change it in a pull request, with a preview of the brand as it would be, or here in the builder. Each side&apos;s edits reach the other.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href={gitLink(git)}
                  className="hover:border-foreground/20 focus-visible:ring-ring/50 grid content-start gap-2 rounded-lg border p-4 outline-none focus-visible:ring-[3px]"
                >
                  <IconFolder className="text-primary size-5" aria-hidden />
                  <span className="text-sm font-medium">Bring in a brand from a repository</span>
                  <span className="text-muted-foreground text-sm">It already has a brand.yaml: pick the repository, and the brand comes in with its pages and files.</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setKeep(true);
                    setStep("builder");
                  }}
                  className="hover:border-foreground/20 focus-visible:ring-ring/50 grid content-start gap-2 rounded-lg border p-4 text-start outline-none focus-visible:ring-[3px]"
                >
                  <IconPlus className="text-primary size-5" aria-hidden />
                  <span className="text-sm font-medium">Start a new brand, kept in a repository</span>
                  <span className="text-muted-foreground text-sm">Blank or from a template, then pick a repository: its files go there as you build.</span>
                </button>
              </div>
              <DialogFooter className="sm:justify-start">
                <Button type="button" variant="ghost" onClick={() => setStep("how")}>
                  <IconArrowLeft /> Back
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "git" && !git && (
            <div className="grid min-w-0 gap-4">
              <DialogHeader>
                <DialogTitle>From a Git repository</DialogTitle>
                <DialogDescription>
                  The brand as YAML beside its logos and fonts, pushed from your repository with the Artbucket CLI. This server has no Git integration, so a push is yours to run, by hand or in CI.
                </DialogDescription>
              </DialogHeader>
              {made ? (
                <div className="grid min-w-0 gap-3">
                  <p className="text-sm font-medium">1. In a checkout of Artbucket, sign the CLI in to this server</p>
                  <Snippet text={`ARTBUCKET_URL=${origin} pnpm artbucket login`} what="the command" />
                  <p className="text-sm font-medium">2. Push your repository&apos;s folder holding brand.yaml</p>
                  <Snippet text={`pnpm artbucket brand push path/to/your-repo/brand --brand ${made.slug}`} what="the command" />
                  <p className="text-muted-foreground text-sm">
                    No brand.yaml yet? <code>pnpm artbucket brand pull path/to/your-repo/brand --brand {made.slug}</code> writes this brand as files to start from.
                  </p>
                </div>
              ) : (
                <form
                  className="grid gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setMade(await send("POST", "/api/v1/brands", { name }));
                    setBusy(false);
                  }}
                >
                  <Label htmlFor={`${id}-git-name`}>Brand name</Label>
                  <div className="flex gap-2">
                    <Input id={`${id}-git-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your brand" required />
                    <Button type="submit" disabled={busy || !name.trim()}>
                      Make it
                    </Button>
                  </div>
                </form>
              )}
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("how")} disabled={!!made}>
                  <IconArrowLeft /> Back
                </Button>
                {made && (
                  <Button type="button" onClick={() => onDone(made)}>
                    Done
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}

          {step === "agent" && (
            <div className="grid min-w-0 gap-4">
              <DialogHeader>
                <DialogTitle>Let an agent build it</DialogTitle>
                <DialogDescription>Connect your agent, then paste the prompt. It makes the brand and fills it in; you review the draft.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-agent-name`}>Brand name</Label>
                  <Input id={`${id}-agent-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your brand" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-site`}>Website</Label>
                  <Input id={`${id}-site`} value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://example.com" inputMode="url" />
                </div>
              </div>
              <Tabs defaultValue={PICKS[0]?.name} className="min-w-0">
                <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
                  {PICKS.map((a) => (
                    <TabsTrigger key={a.name} value={a.name}>
                      <a.icon /> {a.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {PICKS.map((a) => (
                  <TabsContent key={a.name} value={a.name} className="grid min-w-0 gap-3 pt-2">
                    <p className="text-sm font-medium">1. Connect {a.name}</p>
                    {a.snippet({ origin, mcp: `${origin}/api/v1/mcp`, key: "<key>" }).map((p, i) => (
                      <SetupPart key={i} part={p} />
                    ))}
                    <p className="text-sm font-medium">2. Paste this prompt</p>
                    <Snippet text={brief(name, site)} what="the prompt" prose />
                  </TabsContent>
                ))}
              </Tabs>
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("how")}>
                  <IconArrowLeft /> Back
                </Button>
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  text,
  compact,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative grid content-start gap-3 overflow-hidden rounded-lg border text-start transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected ? "border-primary ring-primary ring-1" : "hover:border-foreground/20",
        compact ? "p-3" : "pb-4",
      )}
    >
      {compact ? children : <div className="bg-muted/60 flex h-36 items-end justify-center overflow-hidden px-6 pt-6">{children}</div>}
      <div className={cn("grid gap-1", !compact && "px-4")}>
        <span className={cn("flex items-center gap-1.5 text-sm font-medium", selected && "text-primary")}>
          {title}
          {selected && <IconCheck className="size-4" aria-hidden />}
        </span>
        <span className="text-muted-foreground text-sm">{text}</span>
      </div>
    </button>
  );
}

/** A builder window, drawn in the theme's own greys. */
function BuilderArt() {
  return (
    <div className="bg-background w-full max-w-60 overflow-hidden rounded-t-md border border-b-0 shadow-sm">
      <div className="bg-foreground/85 h-4" />
      <div className="flex gap-2 p-2">
        <div className="grid w-12 content-start gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="bg-muted h-1.5 rounded-full" />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          <span className="bg-muted col-span-2 h-10 rounded" />
          <span className="bg-muted h-10 rounded" />
          <span className="bg-muted col-span-3 h-10 rounded" />
        </div>
      </div>
    </div>
  );
}

/** A brand's folder in a repository: brand.yaml, rules and pages, with the Git mark. */
function FilesArt() {
  const row = (depth: number, icon: React.ReactNode, name: string, width: string) => (
    <span className="flex items-center gap-1.5" style={{ paddingInlineStart: depth * 12 }}>
      {icon}
      <span className="text-muted-foreground font-mono text-[10px] leading-none">{name}</span>
      <span className={cn("bg-muted h-1.5 rounded-full", width)} />
    </span>
  );
  const folder = <IconFolder className="text-muted-foreground size-3.5 shrink-0" />;
  const file = <IconFile className="text-muted-foreground size-3.5 shrink-0" />;
  return (
    <div className="bg-background grid w-full max-w-60 gap-1.5 rounded-t-md border border-b-0 p-3 shadow-sm">
      <span className="mb-0.5 flex items-center gap-1.5 text-xs font-medium">
        <IconBrandGit className="text-primary size-4" /> brand
      </span>
      {row(0, file, "brand.yaml", "w-8")}
      {row(0, folder, "rules", "w-6")}
      {row(1, file, "color.yaml", "w-10")}
      {row(0, folder, "pages", "w-4")}
      {row(1, file, "logo.yaml", "w-7")}
    </div>
  );
}

/** A prompt box, as an agent's chat shows one. */
function AgentArt() {
  return (
    <div className="bg-background grid w-full max-w-60 gap-2 rounded-t-md border border-b-0 p-3 shadow-sm">
      <span className="bg-muted h-4 rounded" />
      <span className="bg-muted h-2.5 w-2/3 rounded-full" />
      <div className="bg-muted/70 mt-1 flex items-center justify-between rounded-md p-1.5">
        <IconSparkles className="text-muted-foreground size-4" />
        <span className="bg-foreground/80 text-background flex size-5 items-center justify-center rounded">
          <IconArrowUp className="size-3.5" />
        </span>
      </div>
    </div>
  );
}
