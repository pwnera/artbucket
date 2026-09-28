"use client";

import { IconDownload, IconExternalLink, IconFile, IconLink } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, ItemText, ItemTitle, itemRoot, useRuleAnchor, useSection } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useAssetUrl } from "@/components/site/asset-url";
import { useMedia, useSite } from "@/components/site/site-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { SITE_PATH } from "@/lib/markdown";
import type { ViewAsset } from "@/lib/site";
import { renditionLabel } from "@/lib/transform";
import { cn } from "@/lib/utils";

/**
 * Resources to open or download: the files of the rules it binds first, as
 * the rule means them (a rendition, else the original), then its items, each
 * a link out, a file, or both. Cards, or rows with `layout: list`.
 */

/** Cards per row, as the section's container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

type Download = { url: string; filename: string; label: string; hint?: string };

export function LinksSection({ section: s, rules }: SectionProps) {
  const list = s.props.layout === "list";
  const anchor = useRuleAnchor();
  // The first file of each rule carries its `rule-{key}` anchor, so v1's links land on it.
  // Only its keys: `rules` also carries a background color and items' keys.
  const files = rules
    .filter((r) => s.keys.includes(r.key))
    .flatMap((r) => r.assets.map((a, j) => ({ a, id: j === 0 ? anchor(r.key) : undefined })));
  const items = s.items ?? [];
  return (
    <div className="space-y-6">
      <Body />
      {files.length + items.length > 0 && (
        <ul className={list ? "divide-y border-y" : cn("grid gap-4", GRID[s.columns])}>
          {files.map(({ a, id }) => (
            <FileEntry key={`${a.id}/${a.rendition}`} asset={a} id={id} list={list} />
          ))}
          {items.map((_, k) => (
            <ItemEntry key={k} k={k} list={list} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A rule's file: its name, type, size (or the rendition the rule means) and its download. */
function FileEntry({ asset: a, id, list }: { asset: ViewAsset; id?: string; list: boolean }) {
  const url = useAssetUrl();
  const name = a.title || a.filename;
  // The original with its metadata; a rendition under the name the server gives it.
  const download: Download = a.rendition
    ? { url: url(a.id, `/${a.rendition}`), filename: "", label: "Download" }
    : { url: url(a.id, "?download"), filename: a.filename, label: "Download" };
  return (
    <Entry
      id={id}
      list={list}
      name={name}
      picture={a.preview ? url(a.id, list ? "/w_96,f_webp" : "/w_640,f_webp") : undefined}
      title={<Name list={list}>{name}</Name>}
      tags={[fileTypeBadge(a.filename, a.mime), a.rendition ? renditionLabel(a.rendition) : formatBytes(a.size)]}
      downloads={[download]}
    />
  );
}

/** An item: a link out or to a page of the brand, a file of the library, or both. */
function ItemEntry({ k, list }: { k: number; list: boolean }) {
  const it = useSection().items![k];
  const { url, href, view } = useSite();
  const media = useMedia(it.asset);
  const name = it.title ?? media?.title ?? media?.filename ?? it.link ?? "Resource";
  const site = it.link ? SITE_PATH.exec(it.link) : null;
  const link = it.link && {
    url: site ? href(site[1] ?? view.page?.slug ?? "", site[2]) : it.link,
    // Out of the brand's pages, to the web: a tab of its own, so the guidelines stay open.
    external: !site && /^https?:/i.test(it.link),
  };
  // Its file was left out of the view (not approved, expired) and it links nowhere: nothing to offer.
  if (!link && !media) return null;
  return (
    <Entry
      item={k}
      list={list}
      name={name}
      picture={media?.thumbnail ? url(media.id, list ? "/w_96,f_webp" : "/w_640,f_webp") : undefined}
      title={it.title ? <ItemTitle i={k} as={list ? "p" : "h3"} className={list ? "text-base" : undefined} /> : <Name list={list}>{name}</Name>}
      text={<ItemText i={k} className="text-muted-foreground" />}
      tags={[
        ...(it.label ? [it.label] : []),
        ...(media ? [fileTypeBadge(media.filename, media.mime), formatBytes(media.size)] : []),
      ]}
      link={link || undefined}
      downloads={media && it.download !== false ? media.downloads : []}
    />
  );
}

/** A title that isn't the section's own words: a file's name. */
function Name({ list, children }: { list: boolean; children: string }) {
  const H = list ? "p" : "h3";
  return <H className={cn(HEAD, "break-words", list ? "text-base" : "text-(length:--brand-h3) leading-snug")}>{children}</H>;
}

/**
 * One resource, as a card or a row. With a link, the whole of it opens the
 * link (the link sits over it, and the downloads and the text's own links sit
 * above that); the downloads are buttons of their own.
 */
function Entry({
  id,
  item,
  list,
  name,
  picture,
  title,
  text,
  tags,
  link,
  downloads,
}: {
  id?: string;
  /** The item it draws, by index; none for a rule's file. */
  item?: number;
  list: boolean;
  /** What the resource is called, for the link's and buttons' names. */
  name: string;
  picture?: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  tags: string[];
  link?: { url: string; external: boolean };
  downloads: Download[];
}) {
  const Icon = link && !downloads.length ? IconLink : IconFile;
  // A card shows a picture only when there is one; a row keeps its place with the kind of thing it is.
  const pic = (picture || list) && (
    <div className={cn("bg-checker relative shrink-0 overflow-hidden", list ? "size-10 rounded-md border" : "aspect-[3/2] border-b")}>
      {picture ? (
        // The resource's name is beside it, so the picture says nothing more.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" loading="lazy" decoding="async" className={cn("size-full", list ? "object-cover" : "object-contain p-4")} />
      ) : (
        <Icon aria-hidden className="text-muted-foreground absolute inset-0 m-auto size-5" stroke={1.5} />
      )}
    </div>
  );
  const meta = (tags.length > 0 || link?.external) && (
    <div className="flex flex-wrap items-center gap-1.5">
      {[...new Set(tags)].map((t) => (
        <Badge key={t} variant="outline">
          {t}
        </Badge>
      ))}
      {link?.external && <IconExternalLink aria-hidden className="text-muted-foreground size-4" />}
    </div>
  );
  const buttons = downloads.length > 0 && (
    <div className="relative z-10 flex flex-wrap gap-1">
      {downloads.map((d) => (
        <Button key={d.url} variant="outline" size="xs" asChild>
          <a href={d.url} download={d.filename} title={d.hint} aria-label={`Download ${name}${downloads.length > 1 ? `, ${d.label}` : ""}`}>
            <IconDownload aria-hidden /> {downloads.length > 1 ? d.label : "Download"}
          </a>
        </Button>
      ))}
    </div>
  );
  const cover = link && (
    <a
      href={link.url}
      {...(link.external && { target: "_blank", rel: "noreferrer" })}
      aria-label={link.external ? `${name} (opens in a new tab)` : name}
      className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent) focus-visible:ring-inset"
    />
  );
  // The text's own links stay clickable above the one over the whole.
  const words = (
    <div className="min-w-0 space-y-1 [&_a]:relative [&_a]:z-10">
      {title}
      {text}
    </div>
  );
  return list ? (
    <li id={id} {...itemRoot(item)} className="relative flex scroll-mt-20 items-center gap-3 py-3">
      {pic}
      <div className="min-w-0 flex-1 space-y-1.5">
        {words}
        {meta}
      </div>
      {buttons}
      {cover}
    </li>
  ) : (
    <li id={id} {...itemRoot(item)} className="bg-card text-card-foreground relative flex scroll-mt-20 flex-col overflow-hidden rounded-xl border">
      {pic}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {words}
        {meta}
        {buttons && <div className="mt-auto">{buttons}</div>}
      </div>
      {cover}
    </li>
  );
}
