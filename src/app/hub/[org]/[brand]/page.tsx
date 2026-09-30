import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconBook, IconExternalLink, IconLock, IconPalette, IconPhoto, IconTag, IconTypography, IconWorld } from "@tabler/icons-react";
import { CopyButton } from "@/components/copy-button";
import { Avatar, Owner, Preview, TabNav } from "@/components/hub";
import { UseBrand } from "@/components/hub-client";
import { Button } from "@/components/ui/button";
import { inkOn } from "@/lib/color";
import { hubBase, hubBrand, hubViewer, type HubBrand } from "@/lib/core/hub";
import { env } from "@/lib/env";
import { isFont } from "@/lib/font";
import { ago, hubPath, parseRef } from "@/lib/hub";
import { renderMarkdown } from "@/lib/markdown";
import { fontValue, ruleName } from "@/lib/rules";
import { withSignature } from "@/lib/signed";

type Props = { params: Promise<{ org: string; brand: string }> };

async function load({ params }: Props) {
  const { org, brand } = await params;
  const ref = parseRef(brand);
  return ref && hubBrand(org, ref.slug, { version: ref.version, viewer: await hubViewer() });
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const b = await load(props);
  if (!b) return {};
  const description = b.tagline ?? `${b.name}'s brand: logos, colors, type and voice, listed by ${b.owner}.`;
  return {
    title: { absolute: `${b.org}/${b.brand}: ${b.name} brand on BrandHub` },
    description,
    openGraph: { title: `${b.name} brand`, description, ...(b.logo && { images: [b.logo] }) },
    // A private brand is its people's; a community one may not come from the brand's owner: search engines leave both out.
    robots: b.visibility === "public" && b.verified ? undefined : { index: false, follow: true },
    // Read on the app's /hub too, by people signed in: the hub's own address is the one to list.
    ...(b.visibility === "public" && { alternates: { canonical: b.url } }),
  };
}

type Rule = HubBrand["rules"][number];
const HEX = /^#[0-9a-f]{6}$/i;
/** Nothing that ends a CSS string or declaration: a family name goes into a style. */
const cssName = (s: string) => s.replace(/["'\\;{}<>]/g, "").trim();
const isDark = (key: string) => /revers|white|dark|negative|inverse|knockout/i.test(key);
const images = (b: HubBrand, r: Rule) =>
  r.assets.filter((a) => a.mime.startsWith("image/")).map((a) => ({ ...a, src: withSignature(`/a/${a.id}/h_320,f_webp`, b.signed[a.id]) }));

/**
 * Its typefaces, loaded to set their specimens: the rule's own files, signed
 * (relative, so they load from the hub's host as its images do), else Google
 * Fonts for a family the rule says comes from there.
 */
function faces(b: HubBrand, fonts: Rule[]) {
  const css: string[] = [];
  const google = new Set<string>();
  const family = fonts.map((r, i) => {
    const v = fontValue(r.value);
    const spec = (r.spec ?? {}) as { source?: string; fallback?: string };
    const fallback = cssName(spec.fallback ?? "") || "system-ui, sans-serif";
    const files = r.assets.filter((a) => isFont(a.mime, a.filename ?? "") && b.signed[a.id]);
    if (files.length) {
      const src = files.map((a) => `url("${withSignature(`/a/${a.id}`, b.signed[a.id])}")`).join(", ");
      css.push(`@font-face{font-family:"hub-font-${i}";src:${src};font-display:swap}`);
      return `"hub-font-${i}", ${fallback}`;
    }
    if (spec.source === "google" && /^[A-Za-z0-9 ]{1,80}$/.test(v.family)) google.add(v.family);
    return `"${cssName(v.family)}", ${fallback}`;
  });
  const href = google.size ? `https://fonts.googleapis.com/css2?${[...google].map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&")}&display=swap` : null;
  return { css: css.join("\n"), href, family };
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

/** A listing, as GitHub shows a repository: who and what up top, the brand as its README, and About, releases and use beside it. */
export default async function HubListing(props: Props) {
  const b = await load(props);
  if (!b) notFound();
  const base = await hubBase();
  const open = b.visibility === "public";
  const pinned = b.version !== b.latest;
  const rules = b.rules.filter((r) => !r.context);
  const colors = rules.filter((r) => r.type === "color" && typeof r.value === "string");
  const fonts = rules.filter((r) => r.type === "font");
  const logos = rules.filter((r) => r.key.startsWith("logo.") && images(b, r).length);
  const words = rules.filter((r) => (r.type === "text" || r.type === "list") && /^(brand|tone|voice)\./.test(r.key));
  const type = faces(b, fonts);
  const here = base + hubPath(b.org, b.brand, pinned ? b.version : null);

  return (
    <>
      {type.css && <style>{type.css}</style>}
      {type.href && <link rel="stylesheet" href={type.href} precedence="default" />}

      <div className="bg-muted/30 border-b">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xl">
              <Avatar name={b.owner} logo={b.logo} tint={b.tint} className="size-7 rounded-md text-3xl" />
              <Link href={`${base}/${b.org}`} className="text-primary-ink truncate hover:underline">
                {b.org}
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link href={here} className="text-primary-ink truncate font-semibold hover:underline">
                {b.brand}
              </Link>
            </div>
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
              {!open && <IconLock aria-hidden className="size-3" />}
              {!open ? "Private" : b.verified ? "Verified" : "Community"}
            </span>
            {pinned && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium">Pinned to release {b.version}</span>}
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {b.guidelines && (
                <Button asChild variant="outline">
                  <a href={b.guidelines} target="_blank" rel="noreferrer">
                    <IconBook aria-hidden /> Guidelines <IconExternalLink aria-hidden className="opacity-60" />
                  </a>
                </Button>
              )}
              {open ? (
                <UseBrand url={b.url} name={b.name} />
              ) : (
                <Button asChild>
                  <a href={`${env.APP_URL}/brands`}>
                    <IconWorld aria-hidden /> Make public
                  </a>
                </Button>
              )}
            </div>
          </div>
          <TabNav
            label={b.name}
            items={[
              { href: "#top", label: "Overview", current: true },
              ...(colors.length ? [{ href: "#colors", label: "Colors", count: colors.length }] : []),
              ...(fonts.length ? [{ href: "#type", label: "Type", count: fonts.length }] : []),
              ...(logos.length ? [{ href: "#logos", label: "Logos", count: logos.length }] : []),
              ...(words.length ? [{ href: "#voice", label: "Voice" }] : []),
              { href: "#versions", label: "Releases", count: b.versions.length },
            ]}
          />
        </div>
      </div>

      <div id="top" className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
        <article className="bg-card min-w-0 overflow-hidden rounded-xl border">
          <div className="text-muted-foreground flex items-center gap-2 border-b px-5 py-3 text-sm">
            <IconBook aria-hidden className="size-4" /> {b.name}
            <span className="ms-auto text-xs">
              v{b.version}
              {b.publishedAt && ` · released ${ago(b.publishedAt)}`}
            </span>
          </div>
          <Preview card={b} className="h-56 md:h-72">
            <div className="absolute inset-x-0 bottom-0 flex h-2">
              {b.swatches.map((c, i) => (
                <span key={i} className="flex-1" style={{ background: c }} />
              ))}
            </div>
          </Preview>
          <header className="grid gap-2 px-5 py-6 md:px-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" style={type.family[0] ? { fontFamily: type.family[0] } : undefined}>
              {b.name}
            </h1>
            {b.tagline && <p className="text-muted-foreground text-lg">{b.tagline}</p>}
            {!open && (
              <p role="note" className="bg-muted mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <IconLock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span>
                  Private: only people in {b.owner}&apos;s workspace see this, signed in. Make it public on the{" "}
                  <a href={`${env.APP_URL}/brands`} className="underline underline-offset-2">
                    Brands page
                  </a>{" "}
                  for anyone, and any agent, to read it.
                </span>
              </p>
            )}
            {open && !b.verified && (
              <p role="note" className="border-warning/40 bg-warning/10 mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <IconAlertTriangle aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
                <span>
                  A community listing: {b.owner} hasn&apos;t proved it holds a domain, so this may not come from {b.name}&apos;s owner. Check their
                  own guidelines before you rely on it.
                </span>
              </p>
            )}
          </header>

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
                      <div className={`h-36 p-6 ${isDark(r.key) ? "bg-[#1c1e22]" : "bg-muted/60"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized */}
                        <img src={a.src} alt={a.title ?? ruleName(r)} className="size-full object-contain" loading="lazy" />
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <span className="truncate text-sm font-medium">{ruleName(r)}</span>
                        <a href={withSignature(`/a/${a.id}?download`, b.signed[a.id])} className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline">
                          Download
                        </a>
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
            <Section id="terms" title="Terms of use" icon={IconBook}>
              {/* Raw HTML in it is escaped (lib/markdown.ts). */}
              <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.terms, { demote: 2 }) }} />
            </Section>
          )}
        </article>

        <aside className="flex min-w-0 flex-col gap-6 text-sm">
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">About</h2>
            {b.tagline && <p className="text-muted-foreground">{b.tagline}</p>}
            {b.guidelines && (
              <a href={b.guidelines} target="_blank" rel="noreferrer" className="text-primary-ink flex items-center gap-2 truncate font-medium hover:underline">
                <IconBook aria-hidden className="size-4 shrink-0" /> {b.guidelines.replace(/^https?:\/\//, "")}
              </a>
            )}
            <Owner verified={b.verified} className="text-sm" />
            <ul className="text-muted-foreground grid gap-1.5">
              <li className="flex items-center gap-2">
                <IconPalette aria-hidden className="size-4" /> {b.colors} {b.colors === 1 ? "color" : "colors"}
              </li>
              <li className="flex items-center gap-2">
                <IconTypography aria-hidden className="size-4" /> {b.families.length ? b.families.join(", ") : "No typeface"}
              </li>
              <li className="flex items-center gap-2">
                <IconPhoto aria-hidden className="size-4" /> {b.logos} {b.logos === 1 ? "logo" : "logos"}
              </li>
            </ul>
          </section>

          <section id="versions" className="flex scroll-mt-20 flex-col gap-3 border-t pt-6">
            <h2 className="flex items-center gap-2 font-semibold">
              Releases <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">{b.versions.length}</span>
            </h2>
            <ol className="grid gap-2">
              {b.versions.slice(0, 6).map((v) => (
                <li key={v.number}>
                  <Link
                    href={base + hubPath(b.org, b.brand, v.number === b.latest ? null : v.number)}
                    aria-current={v.number === b.version ? "page" : undefined}
                    className="hover:bg-muted aria-[current=page]:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <IconTag aria-hidden className="text-success size-4" />
                    <span className="font-medium">v{v.number}</span>
                    {v.number === b.latest && <span className="border-success/40 text-success rounded-full border px-1.5 text-[11px] font-medium">Latest</span>}
                    <span className="text-muted-foreground ms-auto text-xs">{ago(v.publishedAt)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          {open && (
            <section className="flex flex-col gap-3 border-t pt-6">
              <h2 className="font-semibold">For agents</h2>
              <p className="text-muted-foreground text-xs">Public, no key. Hand this to Claude, ChatGPT or any agent before it makes something in {b.name}.</p>
              <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
                <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{b.url}/llms.txt</code>
                <CopyButton text={`${b.url}/llms.txt`} label="Copy the llms.txt address" what="the address" />
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
