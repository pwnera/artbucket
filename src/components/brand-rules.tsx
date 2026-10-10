"use client";

import { useState } from "react";
import { IconCode, IconDownload } from "@/components/icons";
import type { BrandInfo } from "@/components/brand-switcher";
import { InfoTip } from "@/components/info-tip";
import { TokensDialog, tokensPath } from "@/components/tokens-dialog";
import { FileThumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inkOn } from "@/lib/color";
import { contextLabel, fontLabel, fontValue, ruleLabel, ruleName, section, type Rule, type RuleValue } from "@/lib/rules";
import { TOKEN_FORMAT_IDS, TOKEN_FORMATS } from "@/lib/tokens";

/**
 * A brand's Tokens and rules tab, read-only: every rule by section (the
 * key's first part: color, type, logo, tone), each with its value, its
 * variants per context, its note and its files; and its tokens, in every
 * format the API serves (DESIGN.md among them), to download or look at.
 * Rules are changed in the builder's Rules panel.
 */
export function BrandRules({ brand, rules }: { brand: BrandInfo; rules: Rule[] }) {
  const [tokens, setTokens] = useState(false);
  const own = rules.filter((r) => !r.context);
  const variants = (key: string) => rules.filter((r) => r.key === key && r.context);
  const sections = [...new Set(own.map((r) => section(r.key)))];
  return (
    <div className="grid gap-4">
      <section className="bg-card grid gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-medium">
            Tokens
            <InfoTip>Colors, faces and the type scale as code for your stack, each a link that stays current.</InfoTip>
          </h2>
          <Button size="sm" variant="outline" onClick={() => setTokens(true)}>
            <IconCode aria-hidden /> Look at them
          </Button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {TOKEN_FORMAT_IDS.map((id) => (
            <li key={id}>
              <Button size="xs" variant="secondary" asChild>
                <a href={tokensPath(brand, undefined, id)} download={TOKEN_FORMATS[id].file(brand.slug)}>
                  <IconDownload aria-hidden /> {TOKEN_FORMATS[id].label}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {sections.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rules yet. Add them in Edit.</p>
      ) : (
        sections.map((s) => (
          <section key={s} aria-labelledby={`rules-${s}`} className="bg-card rounded-xl border">
            <h2 id={`rules-${s}`} className="border-b px-4 py-3 font-medium">
              {ruleLabel(s)}
            </h2>
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
          </section>
        ))
      )}
      <TokensDialog brand={brand} open={tokens} onOpenChange={setTokens} />
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
