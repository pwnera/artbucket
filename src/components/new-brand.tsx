"use client";

import { useId, useState } from "react";
import { IconArrowLeft, IconArrowUp, IconCheck, IconPlus, IconSparkles } from "@tabler/icons-react";
import { SetupPart, Snippet } from "@/components/agent-access";
import { AGENTS } from "@/components/agent-catalog";
import type { BrandInfo } from "@/components/brand-switcher";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TEMPLATE_CARDS } from "@/lib/brand-templates";
import { cn } from "@/lib/utils";

type Step = "how" | "builder" | "agent";
type Start = "" | (typeof TEMPLATE_CARDS)[number]["id"];

/** The agents the AI path offers, in the order people reach for them: each connects as the Agents page says. */
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
 * A new brand, two ways: laid out by hand in the builder (from nothing, or
 * from a showcase brand to edit), or by an agent, given the one prompt to
 * paste once it is connected.
 */
export function NewBrand({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (b: BrandInfo) => void }) {
  const id = useId();
  const [step, setStep] = useState<Step>("how");
  const [how, setHow] = useState<"builder" | "agent">("builder");
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [start, setStart] = useState<Start>("");
  const [busy, setBusy] = useState(false);

  function pick(s: Start) {
    // A template names the brand until you do.
    const was = TEMPLATE_CARDS.find((t) => t.id === start)?.name ?? "";
    if (!name.trim() || name === was) setName(TEMPLATE_CARDS.find((t) => t.id === s)?.name ?? "");
    setStart(s);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const b: BrandInfo | null = await send("POST", "/api/v1/brands", { name, ...(start && { template: start }) });
    setBusy(false);
    if (b) onDone(b);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl" guard={{ dirty: !!(name || site), onDiscard: onClose }}>
        {step === "how" && (
          <>
            <DialogHeader>
              <DialogTitle>New brand</DialogTitle>
              <DialogDescription>Choose how to set it up. Either way it is a draft until you publish.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How to set it up">
              <Choice selected={how === "builder"} onSelect={() => setHow("builder")} title="Build it in the builder" text="Lay out the pages yourself, from a blank brand or a template like Firefox, Rust or Blender.">
                <BuilderArt />
              </Choice>
              <Choice selected={how === "agent"} onSelect={() => setHow("agent")} title="Start with an AI agent" text="Connect Claude, Cursor or Codex and it writes the rules and pages for you to review.">
                <AgentArt />
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
              <DialogDescription>Start blank, or from a template: its colors, type, logos and pages, yours to change.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Start from">
              <Choice selected={start === ""} onSelect={() => pick("")} title="Blank" text="No rules and no pages: add them as you go." compact>
                <div className="text-muted-foreground flex h-10 items-center justify-center rounded-md border border-dashed">
                  <IconPlus className="size-4" />
                </div>
              </Choice>
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
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your brand" />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep("how")} disabled={busy}>
                <IconArrowLeft /> Back
              </Button>
              <Button type="submit" pending={busy} disabled={!name.trim()}>
                {busy && start ? "Bringing in its logos and fonts" : "Create brand"}
              </Button>
            </DialogFooter>
          </form>
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
