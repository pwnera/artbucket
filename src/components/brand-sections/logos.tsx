"use client";

import { useId, useState } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { AssetTile, LogoTile, pictured } from "@/components/brand-sections/parts";
import { Body, ItemCaption, itemRoot, RuleValue, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { Markdown, MARKER } from "@/components/brand-values";
import { saveZip } from "@/components/save-zip";
import { useAssetUrl } from "@/components/site/asset-url";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { fileSlug } from "@/lib/branding";
import { formatBytes } from "@/lib/filename";
import { pool } from "@/lib/pool";
import { contextLabel, resolve, ruleName } from "@/lib/rules";
import type { ViewAsset, ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { Entry } from "@/lib/zip";

/**
 * The marks, big and a click from taken: each bound logo rule's pictures as
 * tiles on a transparent, light or dark backdrop, each with its download and
 * URL, captioned by its name, what it is and when to use it. Then every mark
 * on every color the section binds (its keys' and its items' color rules),
 * each item a pair never to use, crossed and numbered with a legend. And the
 * kit: every version's originals in one zip. With `ask`, "Which logo?": the
 * reader picks where the mark will run among the section's contexts, and the
 * marks show the version for it, else the default, as check_use resolves.
 */

/** Marks per row, as the section's room allows: one on a phone. */
const GRID: Record<number, string> = {
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

/** A mark's picture as a row of the on-color grid. */
type Row = { key: string; asset: ViewAsset; name: string };

/** A file of the kit: where it goes in the zip, and what it is. */
type KitFile = { name: string; asset: ViewAsset };

// ponytail: ViewAsset doesn't carry supersededBy yet, so every asset passes until the view does.
const current = (a: ViewAsset) => !("supersededBy" in a && a.supersededBy);

const hexOf = (r: ViewRule) => String(r.value).slice(0, 7);

/** `default` in a section's contexts is the rules without one. */
const contextOf = (c: string) => (c === "default" ? null : c);

export function LogosSection({ section: s, rules: bound }: SectionProps) {
  const { view, context } = useSite();
  const anchor = useRuleAnchor();
  const asks = s.props.ask ? (s.contexts ?? []) : [];
  const [asked, setAsked] = useState(() => asks.find((c) => contextOf(c) === context));
  // The builder may take the picked one out of the section's contexts.
  const where = asks.find((c) => c === asked) ?? asks[0];
  // A context's version often has no label of its own: it goes by its default's.
  const nameOf = (key: string) => ruleName(view.rules.find((r) => r.key === key && r.label) ?? { key });
  const items = s.items ?? [];
  // `rules` also carries a background color: grounds are the keys' and items' colors only.
  const grounds = new Set([...s.keys, ...items.flatMap((it) => it.key ?? [])]);
  const marks = bound.filter((r) => s.keys.includes(r.key) && r.type !== "color");
  // The one to use where the reader said: that context's own version, else the default. "" matches none.
  const picked = where === undefined ? null : contextOf(where);
  const own = (k: string) => view.rules.filter((r) => r.key === k && r.type !== "color");
  const shown = asks.length ? s.keys.flatMap((k) => resolve(own(k), picked ?? "")) : marks;
  const colors = bound.filter((r) => r.type === "color" && grounds.has(r.key));
  const rows = marks.flatMap((r): Row[] => {
    const pics = r.assets.filter(pictured);
    return pics.map((a) => ({ key: r.key, asset: a, name: pics.length > 1 ? `${nameOf(r.key)}, ${a.title || a.filename}` : nameOf(r.key) }));
  });
  // Every version of every mark, not just this context's: a dark-background logo is in the kit too.
  const kit =
    s.props.kit === false
      ? []
      : s.keys.flatMap((k) =>
          view.rules
            .filter((r) => r.key === k && r.type !== "color")
            .flatMap((r) => {
              const folder = `${nameOf(k)}${r.context ? ` (${contextLabel(r.context)})` : ""}`.replace(/[\\/]/g, "-");
              return r.assets.filter((a) => current(a) && !a.kept).map((a): KitFile => ({ name: `${folder}/${a.filename}`, asset: a }));
            }),
        );

  return (
    <div className="space-y-10">
      <Body />
      {kit.length > 0 && <Kit files={kit} name={`${fileSlug(view.brand.name)}-logo-kit.zip`} />}
      {where !== undefined && <Where contexts={asks} value={where} onChange={setAsked} />}
      {shown.length > 0 && (
        // Its own container: the frame's is the whole section, wider than the column this sits in.
        <div className="@container">
          <div className={cn("grid gap-x-6 gap-y-10", GRID[s.columns])}>
            {shown.map((r) => (
              <Mark
                // Drawn anew for each place picked, so its tiles start on that place's backdrop.
                key={`${r.key}@${picked ?? ""}`}
                rule={r}
                name={nameOf(r.key)}
                id={anchor(r.key)}
                dark={picked ? /dark/.test(picked) : undefined}
                note={picked && !r.context ? `No ${contextLabel(picked).toLowerCase()} version of its own: this one goes there too.` : undefined}
                tile={{ size: s.props.size as Tile["size"], backdrop: s.props.backdrop as Tile["backdrop"] }}
              />
            ))}
          </div>
        </div>
      )}
      {rows.length > 0 && colors.length > 0 && (
        <OnColor
          rows={rows}
          colors={colors}
          nameOf={nameOf}
          anchor={anchor}
          donts={items.flatMap((it, i) => (it.asset && it.key ? [{ i, asset: it.asset, key: it.key }] : []))}
        />
      )}
    </div>
  );
}

/** "Which logo?": where the reader's mark will run, one of the section's contexts, as native radios. */
function Where({ contexts, value, onChange }: { contexts: string[]; value: string; onChange: (c: string) => void }) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className={cn(LABEL, "text-muted-foreground")}>Where will it run?</legend>
      <div className="flex flex-wrap gap-2">
        {contexts.map((c) => (
          <label
            key={c}
            className="hover:border-foreground/40 has-[:checked]:bg-foreground has-[:checked]:text-background cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--brand-accent)"
          >
            <input type="radio" name={name} value={c} checked={c === value} onChange={() => onChange(c)} className="sr-only" />
            {c === "default" ? "Anywhere else" : contextLabel(c)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Tile = Pick<React.ComponentProps<typeof LogoTile>, "size" | "backdrop">;

function Mark({ rule: r, name, id, dark, note, tile }: { rule: ViewRule; name: string; id?: string; dark?: boolean; note?: string; tile: Tile }) {
  const pics = r.assets.filter(pictured);
  const files = r.assets.filter((a) => !pictured(a));
  return (
    <div id={id} className="@container min-w-0 scroll-mt-20 space-y-3">
      {pics.length > 0 && (
        <div className={cn("grid gap-3", pics.length > 1 && "@lg:grid-cols-2")}>
          {pics.map((a) => (
            // A dark-background version starts on dark, where it is meant to sit; as does any mark picked for a dark place.
            <LogoTile key={a.id} asset={a} dark={dark ?? (!!r.context && /dark/.test(r.context))} {...tile} />
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>{name}</h3>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
        <RuleValue rule={r} />
        {r.usage && (
          <div className="space-y-0.5">
            <p className={cn(LABEL, "text-muted-foreground")}>When to use</p>
            <Markdown text={r.usage} className="text-muted-foreground text-sm" demote />
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {files.map((a) => (
            <AssetTile key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A pair's number, in its cell and in the legend. */
function Num({ n }: { n: number }) {
  return (
    <span className="bg-foreground text-background flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums">
      {n}
    </span>
  );
}

/**
 * Every mark on every bound color, a row per mark: a pair an item forbids
 * carries a cross and its number, which the legend under it explains; every
 * other pair a check. Scrolls sideways when the colors outgrow the room.
 */
function OnColor({
  rows,
  colors,
  donts,
  nameOf,
  anchor,
}: {
  rows: Row[];
  colors: ViewRule[];
  donts: { i: number; asset: string; key: string }[];
  nameOf: (key: string) => string;
  anchor: (key: string) => string | undefined;
}) {
  const url = useAssetUrl();
  const markName = (asset: string) => rows.find((r) => r.asset.id === asset)?.name ?? "A mark";
  return (
    <div className="space-y-4">
      <h3 className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>On color</h3>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="border-separate border-spacing-2 text-xs">
          <thead>
            <tr>
              <td />
              {colors.map((c) => (
                <th key={c.key} id={anchor(c.key)} scope="col" className="max-w-36 scroll-mt-20 px-1 text-start font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="ring-border size-3 shrink-0 rounded-full ring-1" style={{ backgroundColor: hexOf(c) }} />
                    <span className="truncate">{nameOf(c.key)}</span>
                  </span>
                  <span className="text-muted-foreground font-mono font-normal">{hexOf(c)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.key}:${row.asset.id}`}>
                <th scope="row" className="max-w-32 pe-2 text-start align-middle font-medium">
                  {row.name}
                </th>
                {colors.map((c) => {
                  const dont = donts.find((d) => d.asset === row.asset.id && d.key === c.key);
                  return (
                    <td key={c.key} className="p-0">
                      <div className="ring-border relative aspect-[4/3] w-36 overflow-hidden rounded-lg ring-1" style={{ backgroundColor: hexOf(c) }}>
                        <Thumb src={url(row.asset.id, "/w_240,f_webp")} alt={`${row.name} on ${nameOf(c.key)}`} className="p-5" />
                        <span className="bg-background absolute bottom-1.5 start-1.5 flex items-center gap-1 rounded-full p-0.5 shadow-sm">
                          {dont ? (
                            <>
                              {MARKER.dont}
                              <Num n={dont.i + 1} />
                              <span className="sr-only">Don&apos;t, see {dont.i + 1}</span>
                            </>
                          ) : (
                            <>
                              {MARKER.do}
                              <span className="sr-only">Allowed</span>
                            </>
                          )}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {donts.length > 0 && (
        <ol className="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
          {donts.map((d) => (
            <li key={d.i} {...itemRoot(d.i)} className="flex min-w-0 gap-2">
              <Num n={d.i + 1} />
              {MARKER.dont}
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  <span className="sr-only">Don&apos;t: </span>
                  {markName(d.asset)} on {nameOf(d.key)}
                </p>
                <ItemCaption i={d.i} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Every version's originals in one zip, a folder per version ("The logo
 * (Dark background)/logo.svg"), fetched over the page's own signed URLs.
 */
function Kit({ files, name }: { files: KitFile[]; name: string }) {
  const url = useAssetUrl();
  const [busy, setBusy] = useState(false);
  const size = files.reduce((n, f) => n + f.asset.size, 0);

  async function download() {
    setBusy(true);
    // By index: the zip lists the files in the page's order, whichever arrives first.
    const got: (Entry | undefined)[] = [];
    try {
      await pool([...files.keys()], 4, async (i) => {
        const res = await fetch(url(files[i].asset.id, "?download")).catch(() => null);
        // A connection dropped mid-body fails this file, not the kit.
        const body = res?.ok ? await res.arrayBuffer().catch(() => null) : null;
        if (body) got[i] = { name: files[i].name, data: new Uint8Array(body) };
      });
    } finally {
      setBusy(false);
    }
    const entries = got.filter((e): e is Entry => !!e);
    if (!entries.length) return void toast.error("The kit couldn't be downloaded", { description: "Try again in a moment." });
    saveZip(entries, name);
    if (entries.length < files.length) toast.warning(`${files.length - entries.length} of ${files.length} files couldn't be fetched`);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="outline" size="sm" onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? <IconLoader2 className="motion-safe:animate-spin" /> : <IconDownload />} Download the kit
      </Button>
      <span className="text-muted-foreground text-sm">
        {files.length} {files.length === 1 ? "file" : "files"}, {formatBytes(size)}
      </span>
    </div>
  );
}
