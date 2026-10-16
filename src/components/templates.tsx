"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconTemplate } from "@/components/icons";
import { Snippet } from "@/components/agent-access";
import type { BrandHub } from "@/components/brands";
import { useCan, useMe } from "@/components/can";
import { AppHeader, PageHeader } from "@/components/page";
import { PlanGate } from "@/components/plan-gate";
import { Group } from "@/components/settings/panels";
import { has } from "@/components/settings/sections";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Release } from "@/lib/brand-head";
import { brandPath } from "@/lib/site";

type Brand = { slug: string; name: string };
/** One of the brand's own Office files (GET /api/v1/brand/office/templates). */
export type OwnTemplate = {
  id: string;
  filename: string;
  title: string | null;
  kind: string;
  app: string;
  error: string | null;
  themes: number;
  colors: { value: string; count: number }[];
  fonts: { name: string; count: number }[];
  images: { total: number; library: number; updated: number };
  follows: boolean;
};

/** The live release as Office templates (GET /api/v1/brand/office), and what each holds, as the guide says. */
const OFFICE = [
  {
    format: "potx",
    label: "PowerPoint template",
    says: "A slide master in the brand's colors and fonts, with the logo, and three layouts: title, title and content, a section on the accent. Google Slides opens it too.",
  },
  {
    format: "dotx",
    label: "Word template",
    says: "Title and headings in the heading font, body text in the text font, the logo in the header, on A4.",
  },
];

/**
 * Templates: what a brand's latest release makes for people to use
 * elsewhere, one brand at a time (`?brand=`, picked here): its share card,
 * tried live and copied as an og:image tag or a URL; its PowerPoint and Word
 * templates; its own Office files (`own`), each wearing the release when
 * downloaded, with what in them won't; and its press kit, once it is on
 * BrandHub (`hub`: null on a server without one). Nothing until the
 * brand is released: every one of them is drawn from a release. Share cards
 * and Office templates are a plan's (lib/limits.ts `templates`); BrandHub's
 * own card and the press kit are everyone's.
 */
export function Templates({
  brands,
  brand,
  release,
  hub,
  own,
  origin,
}: {
  brands: Brand[];
  /** The brand on show, with what decides who may release it. */
  brand: (Brand & { id: string; private?: boolean }) | null;
  release: Release | null;
  hub: BrandHub | null;
  own: OwnTemplate[];
  origin: string;
}) {
  const router = useRouter();
  const can = useCan();
  const me = useMe();
  const planned = !me || has(me, "templates");
  const published = hub?.published ? hub : null;
  const listed = published?.visibility === "public" ? published : null;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: "Brand files" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader icon={<IconTemplate />} title="Brand files" description="Files made from your brand's latest release, ready to use: a share card for links, slides, documents and the press kit.">
          {brand && brands.length > 1 && (
            <Select value={brand.slug} onValueChange={(slug) => router.push(`/templates?${new URLSearchParams({ brand: slug })}`)}>
              <SelectTrigger size="sm" className="w-44" aria-label="Brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </PageHeader>
        {!brand ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconTemplate />
              </EmptyMedia>
              <EmptyTitle>No brand yet</EmptyTitle>
              <EmptyDescription>Make a brand and release it: its share card, slides and documents show up here.</EmptyDescription>
            </EmptyHeader>
            {can("brand.create") && (
              <EmptyContent>
                <Button asChild>
                  <Link href="/brands?new=brand">New brand</Link>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : !release ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconTemplate />
              </EmptyMedia>
              <EmptyTitle>Release {brand.name} first</EmptyTitle>
              <EmptyDescription>Templates are made from a release, so they always match what people see. Release the brand and they&apos;re ready here.</EmptyDescription>
            </EmptyHeader>
            {can("brand.publish", brand) && (
              <EmptyContent>
                <Button asChild>
                  <Link href={brandPath(brand.slug, "/releases/new")}>Release {brand.name}</Link>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            {(planned || listed) && <ShareCard key={brand.slug} brand={brand} origin={origin} hub={listed} hubbed={!!hub} />}
            {!planned && (
              <PlanGate
                icon={<IconTemplate />}
                title="Brand files aren't in your plan"
                description={`${listed ? "" : "Share cards for any page, and "}PowerPoint and Word templates that wear each release: its colors, its fonts and its current logo, your designers' own files included.`}
              />
            )}
            {planned && (
            <>
            <Group title="Slides and documents" description={`Release ${release.number}, ready to open in PowerPoint or Word. Each new release makes new ones.`}>
              <ul className="divide-y rounded-lg border">
                {OFFICE.map((t) => (
                  <li key={t.format} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                    <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="text-muted-foreground text-xs text-pretty">{t.says}</span>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/api/v1/brand/office?${new URLSearchParams({ brand: brand.slug, format: t.format })}`} download>
                        <IconDownload aria-hidden /> Download .{t.format}
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">Office can&apos;t load web fonts from a template: install the brand&apos;s fonts for the real thing.</p>
            </Group>
            <Group
              title="Your own templates"
              description="Your designers' PowerPoint, Word and Excel files, put on one of the brand's rules as a logo is. Each download wears this release: its colors, its fonts and its current logo. The layouts stay as they made them."
            >
              {own.length ? (
                <ul className="divide-y rounded-lg border">
                  {own.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                      <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {t.title ?? t.filename} <span className="text-muted-foreground font-normal">{t.app}</span>
                        </span>
                        <TemplateCheck t={t} />
                      </div>
                      {!t.error && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/api/v1/brand/office/templates/${t.id}?${new URLSearchParams({ brand: brand.slug })}`} download>
                            <IconDownload aria-hidden /> Download .{t.kind}
                            {/* Named apart from the brand's own .potx and .dotx above, for whoever hears the links in a list. */}
                            <span className="sr-only">: {t.title ?? t.filename}</span>
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  None yet. Upload a deck, a letterhead or a sheet to the library, then add it to a rule of {brand.name}&apos;s, a Templates rule say, on its{" "}
                  <Link href={brandPath(brand.slug, "/rules")} className="text-foreground underline underline-offset-4">
                    Rules
                  </Link>{" "}
                  tab, and release it.
                </p>
              )}
            </Group>
            </>
            )}
            {/* A server without BrandHub has no press kit: it is a listing's. */}
            {hub && (
              <Group
                title="Press kit"
                description={
                  published
                    ? "Every logo as SVG and PNG, the palette, the tokens and the fonts you may hand out, with a README of do's and don'ts. For journalists and partners."
                    : "Every logo, the palette, the tokens and the fonts you may hand out, in one zip. It comes with the brand's BrandHub page."
                }
              >
                {published ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`${published.url}/press-kit.zip`} download>
                        <IconDownload aria-hidden /> Download the press kit
                      </a>
                    </Button>
                    {published.visibility === "public" && <Snippet text={`${published.url}/press-kit.zip`} what="the press kit's address" />}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" asChild className="w-fit">
                    <Link href={brandPath(brand.slug, "/sharing")}>Put it on BrandHub</Link>
                  </Button>
                )}
              </Group>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** What a template's check found, in a line: that it follows the brand, or what won't. */
function TemplateCheck({ t }: { t: OwnTemplate }) {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const notes = t.error
    ? [t.error]
    : [
        ...(!t.themes ? ["no theme, so only its images follow"] : []),
        ...(t.colors.length ? [`${plural(t.colors.length, "color")} set by hand (${t.colors.slice(0, 3).map((c) => c.value).join(", ")})`] : []),
        ...(t.fonts.length ? [`${plural(t.fonts.length, "font")} set by hand (${t.fonts.slice(0, 3).map((f) => f.name).join(", ")})`] : []),
        ...(t.images.library < t.images.total ? [`${plural(t.images.total - t.images.library, "image")} not in the library`] : []),
      ];
  const updated = t.images.updated ? ` ${plural(t.images.updated, "image")} updated to the current version on download.` : "";
  return t.follows ? (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      <IconCircleCheck aria-hidden className="size-3.5 shrink-0" /> Follows the brand.{updated}
    </span>
  ) : (
    <span className="text-muted-foreground flex items-start gap-1 text-xs text-pretty">
      <IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Won&apos;t follow everywhere: {notes.join("; ")}.{updated}
      </span>
    </span>
  );
}

/**
 * The brand's share card (lib/core/cards.ts): its latest release drawn as a
 * 1200x630 Open Graph image, from a URL any page's og:image can name. A
 * public brand's is on BrandHub, keyless; a private one's is the API's,
 * for whoever may read the brand. Title, eyebrow and theme are tried here;
 * the rest (subtitle, image) is the URL's, as the guide says.
 */
function ShareCard({ brand, origin, hub, hubbed }: { brand: Brand; origin: string; hub: Pick<BrandHub, "url"> | null; hubbed: boolean }) {
  const id = useId();
  const [typed, setTyped] = useState({ title: brand.name, eyebrow: "" });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  // Drawn once typing stops, not per key.
  const [shown, setShown] = useState(typed);
  useEffect(() => {
    const t = setTimeout(() => setShown({ title: typed.title.trim() || brand.name, eyebrow: typed.eyebrow.trim() }), 400);
    return () => clearTimeout(t);
  }, [typed, brand.name]);
  const q = new URLSearchParams({ title: shown.title, ...(shown.eyebrow && { eyebrow: shown.eyebrow }), ...(theme === "dark" && { theme }) });
  const url = hub ? `${hub.url}/og.png?${q}` : `${origin}/api/v1/brand/cards/og?${new URLSearchParams({ brand: brand.slug })}&${q}`;
  return (
    <Group
      title="Share card"
      description={
        hub
          ? "The picture a link shows when it's shared, in the brand's colors, fonts and logo. Put its tag on any page: each release restyles every card."
          : `The picture a link shows when it's shared, in the brand's colors, fonts and logo. Its URL needs a key, so save the picture with your page${hubbed ? ", or make the brand public on BrandHub" : ""}.`
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input id={`${id}-title`} value={typed.title} onChange={(e) => setTyped({ ...typed, title: e.target.value })} maxLength={140} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-eyebrow`}>Above it</Label>
          <Input id={`${id}-eyebrow`} value={typed.eyebrow} onChange={(e) => setTyped({ ...typed, eyebrow: e.target.value })} maxLength={60} placeholder="Blog, News, Careers..." />
        </div>
        <div className="grid gap-1.5">
          <Label id={`${id}-theme`}>Theme</Label>
          <ToggleGroup type="single" variant="outline" size="sm" value={theme} onValueChange={(v) => v && setTheme(v as "light" | "dark")} aria-labelledby={`${id}-theme`}>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${brand.name}'s share card, titled ${shown.title}`} width={1200} height={630} className="bg-muted aspect-[1200/630] h-auto w-full max-w-2xl rounded-md border" />
      {hub && <Snippet text={`<meta property="og:image" content="${url.replace(/&/g, "&amp;")}" />`} what="the og:image tag" />}
      <Snippet text={url} what="the card's URL" />
    </Group>
  );
}
