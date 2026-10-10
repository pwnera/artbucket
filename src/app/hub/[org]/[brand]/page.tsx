import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { IconAlertTriangle, IconBook, IconCircleCheckFilled, IconLock, IconPalette, IconPhoto, IconShieldCheck, IconTag, IconTypography, IconWorld } from "@tabler/icons-react";
import { BrandCard, cardParts, faces } from "@/components/brand-card";
import { CopyButton } from "@/components/copy-button";
import { FloatingEdit } from "@/components/floating-edit";
import { Avatar, Owner, Preview, Pulls, TabNav } from "@/components/hub";
import { HubToggle, ListingTrust, StartFrom, UseBrand } from "@/components/hub-client";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/external-link";
import { IconButton } from "@/components/icon-button";
import { hubBase, hubBrand, hubViewer, starred } from "@/lib/core/hub";
import { hubMoved } from "@/lib/core/hub-claims";
import { env } from "@/lib/env";
import { ago, hubPath, parseRef } from "@/lib/hub";
import { builderPath } from "@/lib/site";

type Props = { params: Promise<{ org: string; brand: string }> };

async function load({ params }: Props) {
  const { org, brand } = await params;
  const ref = parseRef(brand);
  const b = ref && (await hubBrand(org, ref.slug, { version: ref.version, viewer: await hubViewer() }));
  // Claimed by whoever proved its domain: its address leads to theirs, for good (its releases are theirs to number).
  const moved = ref && !b && (await hubMoved(org, ref.slug));
  if (moved) permanentRedirect((await hubBase()) + hubPath(moved.org, moved.brand));
  return b;
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

/** A listing, as GitHub shows a repository: who and what up top, the brand as its README, and About, releases and use beside it. */
export default async function HubListing(props: Props) {
  const [b, viewer] = await Promise.all([load(props), hubViewer()]);
  if (!b) notFound();
  const [base, mine] = await Promise.all([hubBase(), viewer ? starred(viewer.user.id) : null]);
  const open = b.visibility === "public";
  const signIn = `${env.APP_URL}/login?next=${encodeURIComponent(`/hub${hubPath(b.org, b.brand)}`)}`;
  const pinned = b.version !== b.latest;
  const { colors, fonts, logos, words } = cardParts(b);
  const type = faces(b, fonts);
  const here = base + hubPath(b.org, b.brand, pinned ? b.version : null);

  // Someone signed in who may edit it (where the session reaches): the floating Edit, into the builder in its project.
  const edit = !!viewer && (await viewer.may(b.projectId, "brand.edit"));

  // It names a domain its organization never proved: whoever proves it is offered the listing (lib/core/hub-claims.ts).
  const claimable = open && !b.verified && !!b.domain;

  return (
    <>
      {claimable && (
        <div role="note" className="border-primary/30 bg-primary/10 border-b">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
            <IconShieldCheck aria-hidden className="text-primary-ink size-5 shrink-0" />
            <p className="min-w-0 flex-1">
              <span className="font-medium">Is <bdi>{b.name}</bdi> your brand?</span>{" "}
              <span className="text-muted-foreground hidden sm:inline">Prove your organization holds {b.domain} to claim this listing: it becomes your brand, verified, and this address leads to it.</span>
            </p>
            <Button asChild variant="outline" size="sm">
              <a href={`${env.APP_URL}/settings/organization/domains`}>Claim this brand</a>
            </Button>
          </div>
        </div>
      )}
      <div className="bg-muted/30 border-b">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xl">
              <Avatar name={b.owner} logo={b.logo} tint={b.tint} palette={b.palette} className="size-7 rounded-md text-3xl" />
              <Link href={`${base}/${b.org}`} className="text-primary-ink truncate hover:underline">
                {b.org}
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link href={here} className="text-primary-ink truncate font-semibold hover:underline">
                {b.brand}
              </Link>
            </div>
            {open && b.verified ? (
              // What was proved, as the prototype's "lumen.dev verified" says.
              <span className="border-success/40 text-success inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                <IconCircleCheckFilled aria-hidden className="size-3" /> {b.verified} verified
              </span>
            ) : claimable ? (
              <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">Unclaimed</span>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                {!open && <IconLock aria-hidden className="size-3" />}
                {!open ? "Private" : "Community"}
              </span>
            )}
            <span className="text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-xs">
              @{b.version}
              {b.publishedAt && ` · ${new Date(b.publishedAt).toLocaleDateString("en", { day: "numeric", month: "short" })}`}
            </span>
            {pinned && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium">Pinned to release @{b.version}</span>}
            <div className="ms-auto flex flex-wrap items-center gap-1">
              {b.guidelines && (
                // A bare anchor: ExternalLink's arrow crowds an icon on its own; the label says where it opens.
                <IconButton asChild variant="ghost" label="Guidelines (opens in a new tab)">
                  <a href={b.guidelines} target="_blank" rel="noreferrer">
                    <IconBook aria-hidden />
                  </a>
                </IconButton>
              )}
              {open && (
                <HubToggle
                  kind="star"
                  api={`/api/v1/hub/${encodeURIComponent(b.org)}/${encodeURIComponent(b.brand)}/star`}
                  on={!!mine?.has(b.brandId)}
                  count={b.stars}
                  signIn={mine ? undefined : signIn}
                  compact
                />
              )}
              {open && mine && <StartFrom from={`${b.org}/${b.brand}@${b.version}`} name={b.name} app={env.APP_URL} />}
              {open ? (
                <UseBrand url={b.url} name={b.name} />
              ) : (
                <Button asChild size="sm" className="ms-1">
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
              @{b.version}
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
                <span>Private: only {b.owner}&apos;s project sees this.</span>
              </p>
            )}
            {open && !b.verified && (
              <p role="note" className="border-warning/40 bg-warning/10 mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <IconAlertTriangle aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
                <span>
                  Unverified: may not come from <bdi>{b.name}</bdi>&apos;s owner.
                </span>
              </p>
            )}
          </header>

          <BrandCard brand={b} />
        </article>

        <aside className="flex min-w-0 flex-col gap-6 text-sm">
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">About</h2>
            {b.guidelines && (
              <ExternalLink href={b.guidelines} className="text-primary-ink flex items-center gap-2 truncate font-medium hover:underline">
                <IconBook aria-hidden className="size-4 shrink-0" /> {b.guidelines.replace(/^https?:\/\//, "")}
              </ExternalLink>
            )}
            {b.domain && (
              <ExternalLink href={`https://${b.domain}`} className="text-primary-ink flex items-center gap-2 truncate font-medium hover:underline">
                <IconWorld aria-hidden className="size-4 shrink-0" /> {b.domain}
              </ExternalLink>
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
              {open && (
                <li className="flex items-center gap-1">
                  <Pulls n={b.pulls} className="gap-2 [&_svg]:size-4" /> in 30 days
                </li>
              )}
            </ul>
          </section>

          <section id="versions" className="flex scroll-mt-20 flex-col gap-3 border-t pt-6">
            <h2 className="flex items-center gap-2 font-semibold">
              Releases <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">{b.versions.length}</span>
            </h2>
            <ol className="grid grid-cols-1 gap-2">
              {b.versions.slice(0, 6).map((v) => (
                <li key={v.number}>
                  <Link
                    href={base + hubPath(b.org, b.brand, v.number === b.latest ? null : v.number)}
                    aria-current={v.number === b.version ? "page" : undefined}
                    className="hover:bg-muted aria-[current=page]:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <IconTag aria-hidden className="text-success size-4" />
                    <span className="font-mono font-medium">@{v.number}</span>
                    {v.name && <span className="text-muted-foreground min-w-0 truncate">{v.name}</span>}
                    {v.number === b.latest && <span className="border-success/40 text-success rounded-full border px-1.5 text-[11px] font-medium">Latest</span>}
                    <span className="text-muted-foreground ms-auto shrink-0 text-xs whitespace-nowrap">{ago(v.publishedAt)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          {open && (
            <section className="flex flex-col gap-3 border-t pt-6">
              <ListingTrust
                org={b.org}
                brand={b.brand}
                name={b.name}
                // A community listing is its brand owner's to claim: signed in, where the session reaches.
                claim={b.verified ? null : viewer ? true : { href: signIn, label: "Sign in" }}
              />
            </section>
          )}

          {open && (
            <section className="flex flex-col gap-3 border-t pt-6">
              <h2 className="font-semibold">For agents</h2>
              <p className="text-muted-foreground text-xs">Public, no key: hand it to any agent.</p>
              <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
                <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{b.url}/llms.txt</code>
                <CopyButton text={`${b.url}/llms.txt`} label="Copy the llms.txt address" what="the address" />
              </div>
            </section>
          )}
        </aside>
      </div>
      {edit && <FloatingEdit always label="Edit this brand" href={env.APP_URL + builderPath(b.brand, { project: b.projectId })} />}
    </>
  );
}
