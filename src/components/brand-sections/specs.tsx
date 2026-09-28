"use client";

import { Markdown } from "@/components/brand-values";
import { Body, Opens, RuleValue, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useSite } from "@/components/site/site-context";
import { measure } from "@/lib/diagram";
import { contextLabel, resolve, ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";

/**
 * Specs table: a row per bound number or text rule, a column per context
 * (the section's `contexts`, else the one being read), each cell the rule as
 * that context has it: its own version, else the default, as everywhere
 * else. A number reads in its `spec.unit`, and for x and %, of what.
 */

const NONE = "–";

export function SpecsSection({ section: s }: SectionProps) {
  const { view, context } = useSite();
  const anchor = useRuleAnchor();
  // `default` in a section's contexts is the rules without one; "" resolves to those.
  const columns = s.contexts ?? [context ?? "default"];
  const rows = s.keys.flatMap((key) => {
    const versions = view.rules.filter((r) => r.key === key && (r.type === "number" || r.type === "text"));
    if (!versions.length) return [];
    // A context's version often has no label or note of its own: the row reads as the default's.
    const head = versions.find((r) => r.context === null) ?? versions[0];
    return [{ key, head, cells: columns.map((c) => resolve(versions, c === "default" ? "" : c)[0]) }];
  });

  return (
    <div className="space-y-8">
      <Body />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th scope="col" className="pe-4 pb-2 text-start font-medium">
                  <span className="sr-only">Spec</span>
                </th>
                {columns.map((c) => (
                  <th key={c} scope="col" className="pe-4 pb-2 text-start font-medium whitespace-nowrap">
                    {s.contexts ? contextLabel(c) : "Value"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, head, cells }) => (
                <tr key={key} id={anchor(key)} className="scroll-mt-20 border-t align-baseline">
                  <th scope="row" className="space-y-1 py-3 pe-4 text-start font-normal">
                    <span className="font-medium">{ruleName(head)}</span>
                    {head.usage && <Markdown text={head.usage} className="text-muted-foreground text-xs" demote />}
                  </th>
                  {cells.map((r, j) => (
                    <td key={columns[j]} className="py-3 pe-4">
                      {r ? (
                        <Cell rule={r} />
                      ) : (
                        <>
                          <span aria-hidden className="text-muted-foreground">
                            {NONE}
                          </span>
                          <span className="sr-only">Not set</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A value as the context has it: words typed in place on the canvas, a number opening its card. */
function Cell({ rule: r }: { rule: ViewRule }) {
  if (r.type === "text")
    return (
      <div className="[&_.rich]:text-sm">
        <RuleValue rule={r} />
      </div>
    );
  const unit = r.spec && "unit" in r.spec ? r.spec.unit : undefined;
  const of = r.spec && "of" in r.spec ? r.spec.of : undefined;
  return (
    <Opens rule={r}>
      <span data-specimen className="font-mono whitespace-nowrap tabular-nums">
        {measure(r.value as number, unit)}
      </span>
      {of && (unit === "x" || unit === "%") && <span className="text-muted-foreground"> {unit === "%" ? `of ${of}` : of}</span>}
    </Opens>
  );
}
