"use client";

import { HEAD, LABEL } from "@/components/brand-sections/look";
import { Body, PropText, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useEdit, useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { cn } from "@/lib/utils";

/**
 * A pull quote: the body set large in the heading face, behind an accent
 * quotation mark; who said it (props.by) in the label face, with a portrait
 * (props.image) when there is one. A text rule it binds is quoted the same way.
 */
export function QuoteSection({ section: s, rules }: SectionProps) {
  const { url } = useSite();
  const by = s.props.by as string | undefined;
  // On the canvas the caption is there to type who said it into.
  const edit = !!useEdit();
  const portrait = useMedia(s.props.image as string | undefined);
  const shown = rules.filter((r) => s.keys.includes(r.key));
  return (
    <figure className="relative space-y-6 ps-8 @3xl:ps-12">
      <span aria-hidden className={cn(HEAD, "text-(--brand-accent) absolute start-0 top-0 text-6xl leading-none select-none @3xl:text-8xl")}>
        &ldquo;
      </span>
      <blockquote className="space-y-6">
        <Body className={cn(HEAD, "text-2xl leading-snug text-pretty @3xl:text-3xl [&_p]:font-[inherit]")} />
        {shown.map((r) => (
          <div key={r.key} className="[&_[data-field=value]_.rich]:font-(family-name:--brand-head) [&_[data-field=value]_.rich]:text-2xl [&_[data-field=value]_.rich]:leading-snug @3xl:[&_[data-field=value]_.rich]:text-3xl">
            <RuleSlot rule={r} />
          </div>
        ))}
      </blockquote>
      {(by || portrait?.preview || edit) && (
        <figcaption className="flex items-center gap-3">
          {portrait?.preview && (
            <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-full">
              <Thumb src={url(portrait.id, "/w_128,f_webp")} alt={portrait.title ?? portrait.filename} className="object-cover p-0" />
            </span>
          )}
          <PropText name="by" label="Who said it" className={cn(LABEL, "text-muted-foreground")} />
        </figcaption>
      )}
    </figure>
  );
}
