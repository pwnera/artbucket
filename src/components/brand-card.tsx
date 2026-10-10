import { IconBook, IconPalette, IconPhoto, IconTypography } from "@/components/icons";
import { LogoWell } from "@/components/hub-client";
import { withSignature } from "@/lib/asset-url";
import { inkOn } from "@/lib/color";
import { isFont } from "@/lib/font";
import { renderMarkdown } from "@/lib/markdown";
import { fontValue, ruleName, type RuleSpec, type RuleType, type RuleValue } from "@/lib/rules";

/**
 * A brand's card: its colors, type, logos, voice and usage terms, as a
 * release has them. BrandHub draws it on a listing (app/hub/[org]/[brand]),
 * the Overview for the brand's own people: the live release, else the draft.
 */

/** `kept`: shown, not handed out (lib/rights.ts isDownloadable). */
type CardAsset = { id: string; mime?: string | null; filename?: string | null; title?: string | null; kept?: true };
export type CardRule = {
  key: string;
  label?: string | null;
  context: string | null;
  type: RuleType;
  value: RuleValue;
  spec?: RuleSpec | null;
  usage: string | null;
  assets: CardAsset[];
};
/** What the card reads: a BrandHub brand (lib/core/hub.ts hubBrand), or the draft's rules. `signed` null: the viewer's session opens every file. */
export type CardBrand = { name: string; rules: CardRule[]; signed: Record<string, string> | null; terms: string | null };

const HEX = /^#[0-9a-f]{6}$/i;
/** Nothing that ends a CSS string or declaration: a family name goes into a style. */
const cssName = (s: string) => s.replace(/["'\\;{}<>]/g, "").trim();
/** A file's address, signed when the viewer needs it. */
const fileUrl = (b: CardBrand, id: string, rest = "") => (b.signed?.[id] ? withSignature(`/a/${id}${rest}`, b.signed[id]) : `/a/${id}${rest}`);
const opens = (b: CardBrand, id: string) => !b.signed || !!b.signed[id];
const images = (b: CardBrand, r: CardRule) =>
  r.assets.filter((a) => a.mime?.startsWith("image/") && opens(b, a.id)).map((a) => ({ ...a, src: fileUrl(b, a.id, "/h_320,f_webp") }));

/** Its sections' rules: the default context's colors, typefaces, logos with a picture, and words. */
export function cardParts(b: CardBrand) {
  const rules = b.rules.filter((r) => !r.context);
  return {
    colors: rules.filter((r) => r.type === "color" && typeof r.value === "string"),
    fonts: rules.filter((r) => r.type === "font"),
    logos: rules.filter((r) => r.key.startsWith("logo.") && images(b, r).length),
    words: rules.filter((r) => (r.type === "text" || r.type === "list") && /^(brand|tone|voice)\./.test(r.key)),
  };
}

/**
 * Its typefaces, loaded to set their specimens: the rule's own files, signed
 * (relative, so they load from the hub's host as its images do). Without
 * files, the family by name, then its fallback: nothing loads from elsewhere.
 */
export function faces(b: CardBrand, fonts: CardRule[]) {
  const css: string[] = [];
  const family = fonts.map((r, i) => {
    const v = fontValue(r.value);
    const spec = (r.spec ?? {}) as { fallback?: string };
    const fallback = cssName(spec.fallback ?? "") || "system-ui, sans-serif";
    const files = r.assets.filter((a) => isFont(a.mime ?? "", a.filename ?? "") && opens(b, a.id));
    if (files.length) {
      const src = files.map((a) => `url("${fileUrl(b, a.id)}")`).join(", ");
      css.push(`@font-face{font-family:"hub-font-${i}";src:${src};font-display:swap}`);
      return `"hub-font-${i}", ${fallback}`;
    }
    return `"${cssName(v.family)}", ${fallback}`;
  });
  return { css: css.join("\n"), family };
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof IconPalette; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-20 gap-4 border-t px-5 py-8 md:px-8">
      <h2 className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Icon aria-hidden className="text-muted-foreground size-5" /> {title}
      </h2>
      {children}
    </section>
  );
}

/** The card's sections, each only when the brand has something for it; `empty` when it has none. */
export function BrandCard({ brand: b, empty = null }: { brand: CardBrand; empty?: React.ReactNode }) {
  const { colors, fonts, logos, words } = cardParts(b);
  const type = faces(b, fonts);
  if (!colors.length && !fonts.length && !logos.length && !words.length && !b.terms) return empty;
  return (
    <>
      {type.css && <style>{type.css}</style>}

      {colors.length > 0 && (
        <Section id="colors" title="Colors" icon={IconPalette}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {colors.map((r) => {
              const hex = String(r.value);
              return (
                <li key={r.key} className="overflow-hidden rounded-lg border">
                  <div className="flex h-24 items-end p-3 font-mono text-xs" style={{ background: hex, color: HEX.test(hex) ? inkOn(hex) : undefined }}>
                    {hex}
                  </div>
                  <div className="grid gap-0.5 p-3">
                    <span className="truncate text-sm font-medium">{ruleName(r)}</span>
                    {r.usage && <span className="text-muted-foreground line-clamp-2 text-xs">{r.usage}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {fonts.length > 0 && (
        <Section id="type" title="Type" icon={IconTypography}>
          <ul className="grid gap-3 md:grid-cols-2">
            {fonts.map((r, i) => {
              const v = fontValue(r.value);
              return (
                <li key={r.key} className="grid gap-3 rounded-lg border p-5">
                  <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium tracking-[.12em] uppercase">{ruleName(r)}</span>
                    <span>
                      {v.family}
                      {v.weight ? ` · ${v.weight}` : ""}
                    </span>
                  </div>
                  <p className="text-6xl leading-none" style={{ fontFamily: type.family[i], fontWeight: v.weight }}>
                    Aa
                  </p>
                  <p className="line-clamp-2 text-xl" style={{ fontFamily: type.family[i], fontWeight: v.weight }}>
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {logos.length > 0 && (
        <Section id="logos" title="Logos" icon={IconPhoto}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {logos.flatMap((r) =>
              images(b, r).map((a) => (
                <li key={`${r.key}:${a.id}`} className="overflow-hidden rounded-lg border">
                  <LogoWell src={a.src} alt={a.title ?? ruleName(r)} />
                  <div className="flex items-center justify-between gap-2 p-3">
                    <span className="truncate text-sm font-medium">{ruleName(r)}</span>
                    {!a.kept && (
                      <a href={fileUrl(b, a.id, "?download")} className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline">
                        Download
                      </a>
                    )}
                  </div>
                </li>
              )),
            )}
          </ul>
        </Section>
      )}

      {words.length > 0 && (
        <Section id="voice" title="Voice" icon={IconTypography}>
          <dl className="grid gap-5">
            {words.map((r) => (
              <div key={r.key} className="grid gap-1.5">
                <dt className="text-muted-foreground text-xs font-medium tracking-[.12em] uppercase">{ruleName(r)}</dt>
                <dd className="text-sm leading-relaxed">
                  {Array.isArray(r.value) ? (
                    <ul className="grid list-disc gap-1 ps-5">
                      {r.value.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  ) : (
                    // Raw HTML in it is escaped (lib/markdown.ts).
                    <div className="rich" dangerouslySetInnerHTML={{ __html: renderMarkdown(String(r.value), { demote: 2 }) }} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {b.terms && (
        <Section id="terms" title="Usage terms" icon={IconBook}>
          {/* Raw HTML in it is escaped (lib/markdown.ts). */}
          <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.terms, { demote: 2 }) }} />
        </Section>
      )}
    </>
  );
}
