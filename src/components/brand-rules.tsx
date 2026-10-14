"use client";

import { useState } from "react";
import { IconCode } from "@/components/icons";
import type { BrandInfo } from "@/components/brand-switcher";
import { TokensDialog } from "@/components/tokens-dialog";
import { ColorCells, ColorHead } from "@/components/color-table";
import { FileThumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inkOn } from "@/lib/color";
import { colorTable, darkContext, hasDark } from "@/lib/color-table";
import { contextLabel, fontLabel, fontValue, ruleLabel, ruleName, section, type Rule, type RuleValue } from "@/lib/rules";

/**
 * The brand's tokens, in every format the API serves (DESIGN.md among them),
 * above its rules on the Rules tab, read-only or not: one line, the formats
 * in the dialog, each to look at, copy, download or link.
 */
export function UseInCode({ brand }: { brand: BrandInfo }) {
  const [tokens, setTokens] = useState(false);
  return (
    <>
      <section className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
        <div className="grid min-w-0 flex-1">
          <h2 className="font-medium">Use in code</h2>
          <p className="text-muted-foreground text-sm">Colors, faces and the type scale as tokens: CSS, Tailwind, shadcn/ui, DTCG, DESIGN.md and more.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setTokens(true)}>
          <IconCode aria-hidden /> Get tokens
        </Button>
      </section>
      <TokensDialog brand={brand} open={tokens} onOpenChange={setTokens} />
    </>
  );
}

/**
 * A brand's Rules tab for whoever may only read: every rule by section (the
 * key's first part: color, type, logo, tone), each with its value, its
 * variants per context, its note and its files, under its tokens. Whoever
 * may edit gets BrandRulesEditor instead.
 */
export function BrandRules({ brand, rules }: { brand: BrandInfo; rules: Rule[] }) {
  const own = rules.filter((r) => !r.context);
  const variants = (key: string) => rules.filter((r) => r.key === key && r.context);
  const sections = [...new Set(own.map((r) => section(r.key)))];
  return (
    <div className="grid gap-4">
      <UseInCode brand={brand} />
      {sections.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rules yet.</p>
      ) : (
        sections.map((s) => (
          <section key={s} aria-labelledby={`rules-${s}`} className="bg-card rounded-xl border">
            <h2 id={`rules-${s}`} className="border-b px-4 py-3 font-medium">
              {ruleLabel(s)}
            </h2>
            {s === "color" ? (
              <Colors rules={rules} />
            ) : (
              <ul className="divide-y">
                {own
                  .filter((r) => section(r.key) === s)
                  .map((r) => (
                    <li key={r.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                      <div className="grid content-start gap-0.5">
                        <span className="text-sm font-medium">{ruleName(r)}</span>
                        <code className="text-muted-foreground font-mono text-xs">{r.key}</code>
                      </div>
                      <div className="grid min-w-0 gap-1.5">
                        <Value rule={r} />
                        {variants(r.key).map((v) => (
                          <div key={v.context} className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{contextLabel(v.context!)}</Badge>
                            <Value rule={v} />
                          </div>
                        ))}
                        {r.usage && <p className="text-muted-foreground text-sm">{r.usage}</p>}
                        {r.assets.length > 0 && (
                          <ul className="flex flex-wrap gap-2">
                            {r.assets.map((a) => (
                              <li key={`${a.id}/${a.rendition}`} className="bg-checker relative size-16 overflow-hidden rounded-md border" title={a.title ?? a.filename}>
                                <FileThumb file={a} src={`/a/${a.id}/w_128,f_webp`} alt={a.title ?? a.filename ?? ""} className="p-1" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/**
 * The color section as a token table: a table per group, light beside dark
 * (lib/color-table.ts), each row's other versions and note under it.
 */
function Colors({ rules }: { rules: Rule[] }) {
  const dark = darkContext(rules.map((r) => r.context));
  const groups = colorTable(rules, dark);
  const shown = hasDark(rules, dark);
  const named = groups.some((g) => g.group);
  return (
    <div className="grid gap-6 py-3">
      {groups.map(({ group, rows }) => (
        <div key={group} className="grid gap-2">
          {named && <h3 className="px-4 pt-1 text-sm font-medium">{group || "Other"}</h3>}
          <div className="border-b px-4 pb-2">
            <ColorHead dark={shown} />
          </div>
          <ul className="divide-y">
            {rows.map((row) => {
              const r = rules.find((x) => x.key === row.key && !x.context)!;
              const others = rules.filter((x) => x.key === row.key && x.context && x.context !== dark);
              return (
                <li key={row.key} className="grid gap-2 px-4 py-2">
                  <ColorCells row={row} label={r.label} dark={shown} />
                  {others.map((v) => (
                    <div key={v.context} className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{contextLabel(v.context!)}</Badge>
                      <Value rule={v} />
                    </div>
                  ))}
                  {r.usage && <p className="text-muted-foreground text-sm">{r.usage}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A rule's value as it reads: a swatch, a face, a list, or the words. */
function Value({ rule: r }: { rule: Rule }) {
  const v: RuleValue = r.value;
  if (r.type === "color" && typeof v === "string") {
    return (
      <span className="flex items-center gap-2">
        <span className="h-7 w-12 rounded-md border" style={{ background: v, color: HEX.test(v) ? inkOn(v) : undefined }} />
        <code className="font-mono text-xs">{v}</code>
      </span>
    );
  }
  if (r.type === "font") return <span className="text-sm">{fontLabel(fontValue(v))}</span>;
  if (Array.isArray(v)) {
    return (
      <ul className="list-disc ps-5 text-sm">
        {v.map((x, i) => (
          <li key={i}>{String(x)}</li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm whitespace-pre-line">{String(v)}</p>;
}
