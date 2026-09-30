"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconBrandGit, IconChevronDown, IconPhoto, IconPlus, IconRobot, IconSparkles, IconUpload, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/asset-picker";
import { useMe } from "@/components/can";
import { upload } from "@/components/brand-sections/slots";
import type { Transport } from "@/components/builder/use-builder";
import { ColorField } from "@/components/color-field";
import { CopyButton } from "@/components/copy-button";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assetUrl } from "@/lib/asset-url";
import type { Init } from "@/lib/builder-ops";
import { inkOn, isHex, mix } from "@/lib/color";
import { gitLink } from "@/lib/git";
import { fontValue } from "@/lib/rules";
import { sendResult } from "@/lib/send";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A brand with no pages starts here (the builder draws it for an empty nav):
 * the essentials every page is drawn from, asked once, on one screen, with
 * the result beside them as it will look. Its colors, two faces, the logo and
 * a sentence of voice become rules (color.primary, color.secondary,
 * color.dark, type.heading, type.body, logo.primary, tone.voice: the names
 * lib/brand-theme.ts reads each part from), then the pages are laid out from
 * them (POST .../pages, lib/pages.ts initialPages), or started blank, or from
 * a topic's six pages. What the brand already has fills the form, and only
 * what changed is written. An agent can do all of it instead: the card
 * beside says what to ask one. Where the server has a Git integration
 * (me.git), the brand can start from a repository's files instead, or keep
 * its files there as it grows.
 *
 * Props:
 * - brand: the brand's slug.
 * - init: what the route loaded; its rules fill the form.
 * - transport: left out, fetch; the dev page records writes instead.
 * - header: the host's bar over the page.
 */
export type BrandSetupProps = {
  brand: string;
  init: Init;
  transport?: Transport;
  header?: React.ReactNode;
};

/** Families from Google Fonts that set a brand well; any other is typed. */
const FACES = [
  "Inter",
  "DM Sans",
  "Manrope",
  "Plus Jakarta Sans",
  "Space Grotesk",
  "Sora",
  "Outfit",
  "Work Sans",
  "IBM Plex Sans",
  "Source Sans 3",
  "Montserrat",
  "Poppins",
  "Fraunces",
  "Playfair Display",
  "DM Serif Display",
  "Lora",
  "Source Serif 4",
  "Libre Baskerville",
];
const OTHER = "\u0000other";

/** Colors to start from, one click each. */
const SWATCHES = ["#6d4aff", "#0f62fe", "#00a67e", "#e8590c", "#e11d48", "#111827"];

/** Starter topics for the six-page set (generate_pages `set`). */
const TOPICS = ["Logo", "Color", "Typography", "Voice"];

type Essentials = {
  primary: string;
  secondary: string | null;
  dark: string | null;
  heading: string;
  body: string;
  logo: { id: string; title: string } | null;
  voice: string;
};

type Start = { kind: "rules" } | { kind: "blank" } | { kind: "topic"; topic: string };

/** A rule the brand has: by key when it is of `type`, else the first `test` takes. */
function had(rules: ViewRule[], key: string, type: ViewRule["type"], test: (r: ViewRule) => boolean) {
  const base = rules.filter((r) => r.context === null && r.type === type);
  return base.find((r) => r.key === key) ?? base.find(test);
}

/** Where a field saves when the brand has no rule for it: its key, unless another type holds that key. */
function free(rules: ViewRule[], key: string) {
  let k = key;
  for (let n = 2; rules.some((r) => r.key === k); n++) k = `${key}${n}`;
  return k;
}

/** The form as the brand's rules fill it: each field keeps the key it came from, so saving it changes that rule. */
function fromRules(rules: ViewRule[]) {
  const color = (r?: ViewRule) => (r && isHex(String(r.value)) ? String(r.value).slice(0, 7) : null);
  const primary = had(rules, "color.primary", "color", () => true);
  const dark = had(rules, "color.dark", "color", (r) => r !== primary && /dark|black|night|navy/i.test(r.key));
  const secondary = had(rules, "color.secondary", "color", (r) => r !== primary && r !== dark && !/ink|text|white|background/i.test(r.key));
  const heading = had(rules, "type.heading", "font", () => true);
  const body = had(rules, "type.body", "font", (r) => r !== heading);
  const logo = had(rules, "logo.primary", "text", (r) => r.key.startsWith("logo.") && r.assets.length > 0);
  const voice = had(rules, "tone.voice", "text", (r) => r.key.startsWith("tone."));
  const asset = logo?.assets[0];
  const values: Essentials = {
    primary: color(primary) ?? SWATCHES[0],
    secondary: color(secondary),
    dark: color(dark),
    heading: heading ? fontValue(heading.value).family : "Inter",
    body: body ? fontValue(body.value).family : heading ? fontValue(heading.value).family : "Inter",
    logo: asset ? { id: asset.id, title: asset.title ?? asset.filename } : null,
    voice: voice ? String(voice.value) : "",
  };
  const keys = {
    primary: primary?.key ?? free(rules, "color.primary"),
    secondary: secondary?.key ?? free(rules, "color.secondary"),
    dark: dark?.key ?? free(rules, "color.dark"),
    heading: heading?.key ?? free(rules, "type.heading"),
    body: body?.key ?? free(rules, "type.body"),
    logo: logo?.key ?? free(rules, "logo.primary"),
    voice: voice?.key ?? free(rules, "tone.voice"),
  };
  return { values, keys, rules: { primary, secondary, dark, heading, body, logo, voice } };
}

/** The rules to write for what changed: the rest are left as they are. */
function rulesFor(e: Essentials, from: ReturnType<typeof fromRules>) {
  const { keys, rules: was } = from;
  const out: Record<string, unknown>[] = [];
  const color = (k: "primary" | "secondary" | "dark", label: string, hex: string | null) => {
    if (hex && hex !== from.values[k]) out.push({ key: keys[k], type: "color", value: hex, label: was[k]?.label ?? label });
  };
  color("primary", "Primary", e.primary);
  color("secondary", "Secondary", e.secondary);
  color("dark", "Dark", e.dark);
  const face = (k: "heading" | "body", role: "display" | "body", family: string) => {
    const f = family.trim();
    if (!f || (was[k] && f === from.values[k])) return;
    out.push({ key: keys[k], type: "font", value: { family: f }, spec: { ...(was[k]?.spec ?? {}), role, source: "google" }, label: was[k]?.label ?? (k === "heading" ? "Headings" : "Text") });
  };
  face("heading", "display", e.heading);
  // One face for both: a text rule too, so each page shows which face sets what.
  face("body", "body", e.body);
  if (e.logo && e.logo.id !== from.values.logo?.id) {
    out.push({ key: keys.logo, type: "text", value: was.logo ? was.logo.value : "The approved logo", label: was.logo?.label ?? "Primary logo", assets: [{ id: e.logo.id, rendition: null }] });
  }
  const voice = e.voice.trim();
  if (voice && voice !== from.values.voice) out.push({ key: keys.voice, type: "text", value: voice, label: was.voice?.label ?? "Voice" });
  return out;
}

/** A family's regular and bold, from Google, for the preview beside the form. */
const loaded = new Set<string>();
function useFace(family: string) {
  useEffect(() => {
    const f = family.trim();
    if (!f || loaded.has(f) || !/^[\w\s-]+$/.test(f)) return;
    loaded.add(f);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.replace(/ +/g, "+")}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }, [family]);
}

export function BrandSetup({ brand, init, transport = sendResult, header }: BrandSetupProps) {
  const router = useRouter();
  const git = useMe()?.git ?? null;
  const name = init.view.brand.name;
  const [from] = useState(() => fromRules(init.rules));
  const [e, setE] = useState<Essentials>(from.values);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const put = (patch: Partial<Essentials>) => setE((x) => ({ ...x, ...patch }));
  useFace(e.heading);
  useFace(e.body);

  const create = async (start: Start) => {
    const set = rulesFor(e, from);
    if (set.length) {
      setBusy("Saving the essentials");
      const res = await transport("PATCH", `/api/v1/brand/rules?brand=${encodeURIComponent(brand)}`, { set });
      if (!res.ok) return setBusy(null);
    }
    setBusy("Laying out the pages");
    const pages = `/api/v1/brands/${encodeURIComponent(brand)}/pages`;
    const res =
      start.kind === "blank"
        ? await transport("PUT", `${pages}/overview`, { title: "Overview", sections: [{ template: "cover", title: name, body: `How ${name} looks, sounds and is used.` }] })
        : await transport("POST", pages, start.kind === "topic" ? { set: { topic: start.topic } } : undefined);
    setBusy(null);
    if (!res.ok) return;
    toast.success(`${name}'s pages are ready`, { description: "Everything is a draft until you release it." });
    router.refresh();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const a = await upload(f);
      put({ logo: { id: a.id, title: a.filename } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const prompt = `Set up the ${name} brand in Artbucket: read brand_playbook, then call brand_status and work through its steps, starting with the rules. Research the brand's own site first. Ask me before you publish.`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {header}
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-12">
        <main className="grid min-w-0 content-start gap-6">
          <div className="grid gap-2">
            <p className="text-primary flex items-center gap-1.5 text-sm font-medium">
              <IconSparkles aria-hidden className="size-4" /> Brand pages
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Set up {name}</h1>
            <p className="text-muted-foreground max-w-prose">
              Four essentials make every page look and sound like {name}. The pages are laid out from them, and all of it stays editable, and private until you release it.
            </p>
          </div>

          {git && (
            <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-4">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <IconBrandGit aria-hidden className="size-5" />
              </span>
              <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
                <p className="text-sm font-medium">Keep {name} in a Git repository</p>
                <p className="text-muted-foreground text-sm">
                  Start from a repository that already has the brand&apos;s files, or keep these there as you build. Pull requests get a preview, and edits go both ways.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={gitLink(git, brand)}>
                  <IconBrandGit /> Connect a repository
                </a>
              </Button>
            </div>
          )}

          <Step n={1} title="Colors" about="The main color is the pages' accent; the others set grounds and panels.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="setup-primary">Main</Label>
                <ColorField id="setup-primary" label="Main color" value={e.primary} onChange={(primary) => put({ primary })} />
                <div className="flex gap-1" role="group" aria-label="Suggested colors">
                  {SWATCHES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`Use ${s}`}
                      aria-pressed={e.primary === s}
                      onClick={() => put({ primary: s })}
                      className="ring-offset-background focus-visible:ring-ring aria-pressed:ring-foreground size-5 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-offset-1"
                      style={{ background: s }}
                    />
                  ))}
                </div>
              </div>
              <Optional id="setup-secondary" label="Second" value={e.secondary} fallback={mix(e.primary, "#ffffff", 0.55)} onChange={(secondary) => put({ secondary })} />
              <Optional id="setup-dark" label="Dark" value={e.dark} fallback="#111827" onChange={(dark) => put({ dark })} />
            </div>
          </Step>

          <Step n={2} title="Typefaces" about="From Google Fonts, served with the pages. A family of your own can be added with its files later.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FacePicker id="setup-heading" label="Headings" value={e.heading} onChange={(heading) => put({ heading })} />
              <FacePicker id="setup-body" label="Text" value={e.body} onChange={(body) => put({ body })} />
            </div>
          </Step>

          <Step n={3} title="Logo" about="Covers and the header show it. It can be added later, on the Logo page." optional>
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                {e.logo ? <Thumb src={assetUrl(e.logo.id, "/w_120,f_webp")} alt={e.logo.title} /> : <IconPhoto aria-hidden className="text-muted-foreground size-5" />}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()} pending={uploading}>
                <IconUpload /> Upload
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                From the library
              </Button>
              {e.logo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => put({ logo: null })}>
                  Remove
                </Button>
              )}
              <input ref={file} type="file" accept="image/*" hidden onChange={(ev) => void onFile(ev.currentTarget.files?.[0])} />
            </div>
          </Step>

          <Step n={4} title="Voice" about="How the brand sounds, in a sentence. The Voice page starts from it." optional>
            <Textarea id="setup-voice" aria-label="Voice" value={e.voice} onChange={(ev) => put({ voice: ev.target.value })} maxLength={500} rows={2} placeholder="Plain, warm and specific. We say what things do." />
          </Step>

          <div className="flex flex-wrap items-center gap-2 border-t pt-6">
            <Button size="lg" onClick={() => void create({ kind: "rules" })} pending={busy !== null} disabled={!isHex(e.primary)}>
              {busy ?? "Create the brand pages"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="lg" disabled={busy !== null}>
                  Other starts <IconChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onSelect={() => void create({ kind: "blank" })}>
                  <div className="grid">
                    <span>A blank page</span>
                    <span className="text-muted-foreground text-xs">A cover to build on, section by section</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Six pages on one topic</DropdownMenuLabel>
                {TOPICS.map((topic) => (
                  <DropdownMenuItem key={topic} onSelect={() => void create({ kind: "topic", topic })}>
                    {topic}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-muted-foreground w-full text-sm">An overview, then a page each for color, typography, logo and voice, in the templates they fit.</p>
          </div>
        </main>

        <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
          <Preview name={name} e={e} />
          <div className="bg-card grid gap-3 rounded-xl border p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <IconRobot aria-hidden className="text-muted-foreground size-4" /> Rather have an agent build it?
            </p>
            <p className="text-muted-foreground text-sm">Connect Claude, ChatGPT or any MCP client, then ask:</p>
            <div className="bg-muted relative rounded-lg p-3 pe-9 text-sm">
              {prompt}
              <CopyButton text={prompt} label="Copy the prompt" what="The prompt" className="absolute end-1.5 top-1.5" />
            </div>
            <Link href="/agents" className="text-sm font-medium underline underline-offset-4">
              Connect an agent
            </Link>
          </div>
        </aside>
      </div>

      {picking && (
        <LibraryPicker
          title="Pick the logo"
          description="From the library."
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setPicking(false);
            put({ logo: { id: a.id, title: a.metadata?.title ?? a.filename } });
          }}
        />
      )}
    </div>
  );
}

/** One essential: its number, its name, why it matters, and its fields. */
function Step({ n, title, about, optional, children }: { n: number; title: string; about: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`setup-step-${n}`} className="bg-card grid gap-4 rounded-xl border p-5">
      <header className="flex gap-3">
        <span aria-hidden className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
          {n}
        </span>
        <div className="grid gap-0.5">
          <h2 id={`setup-step-${n}`} className="font-medium">
            {title} {optional && <span className="text-muted-foreground text-sm font-normal">(optional)</span>}
          </h2>
          <p className="text-muted-foreground text-sm">{about}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** A color the brand may not have: an Add button until it does, then its field and a way to drop it. */
function Optional({ id, label, value, fallback, onChange }: { id: string; label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={value === null ? undefined : id}>
        {label} <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      {value === null ? (
        <Button type="button" variant="outline" className="justify-start border-dashed" onClick={() => onChange(fallback)}>
          <IconPlus /> Add a color
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <ColorField id={id} label={`${label} color`} value={value} onChange={onChange} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove the ${label.toLowerCase()} color`} onClick={() => onChange(null)}>
            <IconX />
          </Button>
        </div>
      )}
    </div>
  );
}

/** A family: one of FACES, each shown in itself, or any other Google family by name. */
function FacePicker({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(() => !FACES.includes(value));
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={other ? OTHER : value}
        onValueChange={(v) => {
          setOther(v === OTHER);
          if (v !== OTHER) onChange(v);
        }}
      >
        <SelectTrigger id={id} className="w-full" style={other ? undefined : { fontFamily: `"${value}", var(--font-sans)` }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {FACES.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Another family…</SelectItem>
        </SelectContent>
      </Select>
      {other && <Input aria-label={`${label}: a Google Fonts family`} value={value} onChange={(ev) => onChange(ev.target.value)} placeholder="Family name, as on Google Fonts" maxLength={120} />}
    </div>
  );
}

/** The cover and first lines as the pages will draw them, in the brand's colors and faces. */
function Preview({ name, e }: { name: string; e: Essentials }) {
  const head = { fontFamily: `"${e.heading}", var(--font-sans)` };
  const body = { fontFamily: `"${e.body}", var(--font-sans)` };
  const ink = inkOn(e.primary);
  const swatches = [e.primary, e.secondary, e.dark].filter((c): c is string => !!c);
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="grid gap-3 p-6" style={{ background: e.primary, color: ink }}>
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-white/90">
          {e.logo ? <Thumb src={assetUrl(e.logo.id, "/w_80,f_webp")} alt="" /> : <span className="text-sm font-bold text-black">{name.slice(0, 1).toUpperCase()}</span>}
        </span>
        <p className="text-[0.65rem] tracking-widest uppercase opacity-80" style={body}>
          Brand guidelines
        </p>
        <p className="text-3xl leading-tight font-bold" style={head}>
          {name}
        </p>
        <p className="text-sm opacity-90" style={body}>
          {e.voice.trim() || `How ${name} looks, sounds and is used.`}
        </p>
      </div>
      <div className="grid gap-4 p-5">
        <div className="flex h-10 overflow-hidden rounded-md border">
          {swatches.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
          <span className="flex-1 bg-white" />
        </div>
        <div className="flex items-end gap-4">
          <span className="text-5xl leading-none" style={head}>
            Aa
          </span>
          <span className="text-muted-foreground grid text-xs">
            <span className={cn("text-foreground truncate")} style={head}>
              {e.heading || "Headings"}
            </span>
            <span className="truncate" style={body}>
              {e.body || "Text"}
            </span>
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={body}>
          The quick brown fox jumps over the lazy dog, set in {e.body || "the text face"}.
        </p>
        <p className="text-muted-foreground border-t pt-3 text-xs">Makes: Overview, Color, Typography{e.logo ? ", Logo" : ""}{e.voice.trim() ? ", Voice" : ""}</p>
      </div>
    </div>
  );
}
