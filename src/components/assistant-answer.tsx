"use client";

import { useEffect, useMemo, useState } from "react";
import { IconFolder, IconPalette } from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { CopyButton, copyText } from "@/components/copy-button";
import { GRID_MAX, VERDICTS, parseAnswer, type Block, type DateWord, type Inline, type Verdict } from "@/lib/assistant-answer";
import { cn } from "@/lib/utils";

/**
 * An answer of the server's assistant, drawn (lib/assistant-answer.ts reads
 * it): its Markdown, and its blocks with the app's own pieces, an asset's
 * thumbnail, a swatch, a verdict, a typeface in its face. A place in the app
 * (an asset, a brand's page) is gone to with `onGo`, beside the panel; a
 * change waiting for approval is the panel's to draw (`card`); a question to
 * tap is asked with `onAsk`, and without it (an earlier answer) isn't drawn.
 */
export function AssistantAnswer({
  text,
  streaming = false,
  card,
  onGo,
  onAsk,
}: {
  text: string;
  streaming?: boolean;
  card: (id: string) => React.ReactNode;
  onGo: (path: string) => void;
  onAsk?: (question: string) => void;
}) {
  const blocks = useMemo(() => parseAnswer(text, { streaming }), [text, streaming]);
  return (
    <div className="grid min-w-0 gap-2 text-sm leading-relaxed [overflow-wrap:anywhere]">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} card={card} onGo={onGo} onAsk={onAsk} />
      ))}
    </div>
  );
}

type Go = { onGo: (path: string) => void };

function BlockView({ b, card, onGo, onAsk }: { b: Block; card: (id: string) => React.ReactNode; onAsk?: (question: string) => void } & Go) {
  switch (b.t) {
    case "p":
      return (
        <p>
          <Inlines nodes={b.inline} onGo={onGo} />
        </p>
      );
    // A section label, not a bigger title: it splits the parts of one answer.
    case "h":
      return (
        <h3 className="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">
          <Inlines nodes={b.inline} onGo={onGo} />
        </h3>
      );
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L className={cn("grid gap-1 ps-5", b.ordered ? "list-decimal" : "list-disc")}>
          {b.items.map((item, i) => (
            <li key={i}>
              <Inlines nodes={item} onGo={onGo} />
            </li>
          ))}
        </L>
      );
    }
    case "code":
      return (
        <div className="bg-muted relative min-w-0 rounded-md">
          <CopyButton text={b.text} label="Copy" what="the code" className="absolute end-1 top-1" />
          <pre className="overflow-x-auto p-3 pe-9 font-mono text-xs leading-relaxed">
            <code>{b.text}</code>
          </pre>
        </div>
      );
    case "table":
      return (
        <div className="min-w-0 overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-start">
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} className="px-2.5 py-1.5 text-start font-medium">
                    <Inlines nodes={c} onGo={onGo} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className="min-w-24 px-2.5 py-1.5 align-top">
                      <Inlines nodes={c} onGo={onGo} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout":
      return (
        <div className={cn("rounded-lg border-s-4 px-3 py-2", b.warn ? "border-warning bg-warning/10" : "border-border bg-muted/60")}>
          {b.lines.map((l, i) => (
            <p key={i}>
              <Inlines nodes={l} onGo={onGo} />
            </p>
          ))}
        </div>
      );
    case "assets":
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
          {b.items.map((a, i) => (
            <AssetLink key={`${a.id}-${i}`} id={a.id} name={a.name} tile onGo={onGo} />
          ))}
          {b.more > 0 && (
            <span className="text-muted-foreground grid min-h-16 place-items-center rounded-lg border border-dashed text-xs" title={`Shows ${GRID_MAX}`}>
              +{b.more} more
            </span>
          )}
        </div>
      );
    case "verdict":
      return <VerdictView kind={b.kind} why={b.why} onGo={onGo} />;
    case "font":
      return <FontSample family={b.family} role={b.role} asset={b.asset} />;
    case "action":
      return <>{card(b.id)}</>;
    case "facts":
      return (
        <dl className="bg-card grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
          {b.rows.map((r, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground text-xs leading-relaxed">{r.label}</dt>
              <dd>
                <Inlines nodes={r.value} onGo={onGo} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "next":
      return onAsk ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {b.items.map((q) => (
            <button key={q} type="button" onClick={() => onAsk(q)} className="bg-muted hover:bg-accent rounded-full px-3 py-1 text-start text-xs">
              {q}
            </button>
          ))}
        </div>
      ) : null;
  }
}

function Inlines({ nodes, onGo }: { nodes: Inline[] } & Go) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineView key={i} n={n} onGo={onGo} />
      ))}
    </>
  );
}

function InlineView({ n, onGo }: { n: Inline } & Go) {
  switch (n.t) {
    case "text":
      return <>{n.text}</>;
    case "code":
      return <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{n.text}</code>;
    case "strong":
      return (
        <strong className="font-semibold">
          <Inlines nodes={n.children} onGo={onGo} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={n.children} onGo={onGo} />
        </em>
      );
    case "link":
      return (
        <a href={n.href} target="_blank" rel="noopener noreferrer" className="text-primary-ink underline-offset-2 hover:underline">
          <Inlines nodes={n.children} onGo={onGo} />
        </a>
      );
    case "asset":
      return <AssetLink id={n.id} name={n.name} onGo={onGo} />;
    case "color":
      return <Swatch hex={n.hex} name={n.name} />;
    case "place":
      return (
        <a
          href={n.path}
          onClick={(e) => go(e, n.path, onGo)}
          className="bg-primary/10 text-primary-ink hover:bg-primary/20 inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium no-underline"
        >
          {n.label} <span aria-hidden>→</span>
        </a>
      );
    case "date":
      return <DateView iso={n.iso} word={n.word} />;
    case "brand":
      return (
        <Chip path={`/brands/${n.slug}`} onGo={onGo} mark={<IconPalette className="text-muted-foreground size-3.5" />}>
          {n.name}
        </Chip>
      );
    case "collection":
      return (
        <Chip path={`/?collection=${n.id}`} onGo={onGo} mark={<IconFolder className="text-muted-foreground size-3.5" />}>
          {n.name}
        </Chip>
      );
    case "person":
      return <PersonChip name={n.name} onGo={onGo} />;
  }
}

const CHIP = "bg-card mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-px align-middle text-xs no-underline";

/** A brand or a collection, inline: its mark and name; a click opens it beside the panel. */
function Chip({ path, mark, children, onGo }: { path: string; mark: React.ReactNode; children: React.ReactNode } & Go) {
  return (
    <a href={path} onClick={(e) => go(e, path, onGo)} className={cn(CHIP, "hover:border-primary")}>
      {mark}
      <span className="truncate">{children}</span>
    </a>
  );
}

/** A person, inline: their initials and name; Team opens for whoever may see it. */
function PersonChip({ name, onGo }: { name: string } & Go) {
  const can = useCan();
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const inner = (
    <>
      <span className="bg-muted grid size-4 place-items-center rounded-full text-[0.55rem] font-semibold">{initials}</span>
      <span className="truncate">{name}</span>
    </>
  );
  return can("member.manage") ? (
    <a href="/team" onClick={(e) => go(e, "/team", onGo)} className={cn(CHIP, "hover:border-primary")}>
      {inner}
    </a>
  ) : (
    <span className={CHIP}>{inner}</span>
  );
}

const DAY = 86_400_000;
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** How far a day is from today, in the person's language: "in 11 weeks", "3 days ago". */
function fromNow(iso: string, now: number) {
  const days = Math.round((at(iso).getTime() - now) / DAY);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const a = Math.abs(days);
  return a < 14 ? rtf.format(days, "day") : a < 60 ? rtf.format(Math.round(days / 7), "week") : a < 730 ? rtf.format(Math.round(days / 30), "month") : rtf.format(Math.round(days / 365), "year");
}

/** A day in the person's locale; how far it is on hover. An end ("until") already past is muted, one within 30 days a warning. */
function DateView({ iso, word }: { iso: string; word: DateWord | null }) {
  // Answers are drawn in the browser, from the stream: its clock is the person's. Read once, as the day was drawn.
  const [now] = useState(() => Date.now());
  const left = (at(iso).getTime() - now) / DAY;
  const tone = word === "until" ? (left < 0 ? "text-muted-foreground line-through" : left <= 30 ? "text-warning font-medium" : "") : "";
  return (
    <time dateTime={iso} title={fromNow(iso, now)} className={tone} suppressHydrationWarning>
      {word && `${word} `}
      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(at(iso))}
    </time>
  );
}

/** A click on a place in the app goes there beside the panel; a modified click opens it as the browser would. */
function go(e: React.MouseEvent, path: string, onGo: (path: string) => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  onGo(path);
}

/** An asset: its thumbnail and name, inline, or a tile in a grid. A file with no picture shows its type instead. */
function AssetLink({ id, name, tile = false, onGo }: { id: string; name: string; tile?: boolean } & Go) {
  const [blank, setBlank] = useState(false);
  const ext = (name.match(/\.(\w{1,5})$/)?.[1] ?? "file").toUpperCase();
  const path = `/?asset=${id}`;
  const thumb = blank ? (
    <span className={cn("bg-muted text-muted-foreground grid place-items-center font-mono font-semibold", tile ? "aspect-square w-full text-xs" : "size-6 rounded text-[0.5rem]")}>
      {ext}
    </span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      loading="lazy"
      src={`/a/${id}/w_160,f_webp`}
      onError={() => setBlank(true)}
      className={cn("bg-muted object-cover", tile ? "aspect-square w-full" : "size-6 shrink-0 rounded")}
    />
  );
  if (tile) {
    return (
      <a href={path} onClick={(e) => go(e, path, onGo)} className="bg-card hover:border-primary flex min-w-0 flex-col overflow-hidden rounded-lg border">
        {thumb}
        <span className="truncate px-2 py-1 text-xs">{name || "Asset"}</span>
      </a>
    );
  }
  return (
    <a
      href={path}
      onClick={(e) => go(e, path, onGo)}
      className="bg-card hover:border-primary mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border py-0.5 ps-0.5 pe-2 align-middle no-underline"
    >
      {thumb}
      <span className="truncate">{name || "Asset"}</span>
    </a>
  );
}

/** A color: its swatch, its name, its HEX; a click copies the HEX. */
function Swatch({ hex, name }: { hex: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      title={`Copy ${hex}`}
      onClick={async () => setCopied(await copyText(hex, { what: "the color" }))}
      className={cn(
        "bg-card mx-0.5 inline-flex cursor-copy items-center gap-1.5 rounded-full border py-0.5 ps-0.5 pe-2 align-middle text-xs",
        copied && "border-primary",
      )}
    >
      <i className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]" style={{ background: hex }} />
      {name && <span>{name}</span>}
      <code className="text-muted-foreground font-mono text-[0.7rem]">{copied ? "Copied" : hex.toUpperCase()}</code>
    </button>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  yes: "border-success bg-success/10 [&_strong]:text-success",
  conditions: "border-warning bg-warning/10 [&_strong]:text-warning",
  no: "border-destructive bg-destructive/10 [&_strong]:text-destructive",
};

/** May it be used: a banner, and why. */
function VerdictView({ kind, why, onGo }: { kind: Verdict; why: Inline[] } & Go) {
  return (
    <div className={cn("grid gap-0.5 rounded-lg border border-s-4 px-3 py-2", VERDICT_STYLE[kind])}>
      <strong className="font-semibold">{VERDICTS[kind]}</strong>
      {why.length > 0 && (
        <span>
          <Inlines nodes={why} onGo={onGo} />
        </span>
      )}
    </div>
  );
}

/** Typefaces drawn in their own face: loaded once each, from the library. */
const faces = new Map<string, Promise<string | null>>();
function face(src: string) {
  if (!faces.has(src)) {
    const name = `ab-${src.replace(/[^\w-]/g, "")}`;
    faces.set(
      src,
      new FontFace(name, `url(${src})`)
        .load()
        .then((f) => (document.fonts.add(f), name))
        .catch(() => null),
    );
  }
  return faces.get(src)!;
}

function FontSample({ family, role, asset }: { family: string; role: string; asset: string | null }) {
  const fallback = `"${family.replace(/["\\]/g, "")}", ui-serif, Georgia, serif`;
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!asset) return;
    let live = true;
    void face(`/a/${asset}`).then((name) => live && setLoaded(name));
    return () => {
      live = false;
    };
  }, [asset]);
  return (
    <div className="bg-card grid gap-1 rounded-lg border px-3 py-2.5">
      <span className="text-2xl leading-tight" style={{ fontFamily: loaded ? `"${loaded}", ${fallback}` : fallback }}>
        Aa Bb Cc 123
      </span>
      <span className="text-muted-foreground text-xs">
        <strong className="text-foreground font-medium">{family}</strong>
        {role && ` · ${role}`}
      </span>
    </div>
  );
}
