import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, Cards, Dots, Owner, TabNav } from "@/components/hub";
import { hubBase, hubListings, hubOwner, hubViewer } from "@/lib/core/hub";

type Props = { params: Promise<{ org: string }> };

async function load(org: string) {
  const [owner, cards] = await Promise.all([hubOwner(org), hubListings({ org, sort: "name", limit: 200, viewer: await hubViewer() })]);
  // An organization that lists nothing isn't on the hub: its name tells nobody anything.
  return owner && cards.length ? { owner, cards } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const got = await load((await params).org);
  if (!got) return {};
  return {
    title: { absolute: `${got.owner.name} on BrandHub` },
    description: `${got.cards.length} ${got.cards.length === 1 ? "brand" : "brands"} from ${got.owner.name}: ${got.cards.map((c) => c.name).join(", ")}.`,
    robots: got.owner.verified ? undefined : { index: false, follow: true },
  };
}

/** An organization, as GitHub shows one: who it is on the side, its brands beside. */
export default async function HubOwner({ params }: Props) {
  const got = await load((await params).org);
  if (!got) notFound();
  const { owner, cards } = got;
  const base = await hubBase();
  const [first] = cards;
  const colors = [...new Set(cards.flatMap((c) => c.swatches))].slice(0, 8);
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-[16rem_1fr] md:py-10">
      <aside className="grid content-start gap-4">
        <Avatar name={owner.name} logo={first.logo} tint={first.tint} className="size-24 text-8xl md:size-64 md:rounded-2xl" />
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{owner.name}</h1>
          <p className="text-muted-foreground text-lg">{owner.slug}</p>
        </div>
        <Owner verified={owner.verified} className="text-sm" />
        <dl className="text-muted-foreground grid gap-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Brands</dt>
            <dd className="text-foreground font-medium tabular-nums">{cards.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Colors</dt>
            <dd>
              <Dots colors={colors} />
            </dd>
          </div>
        </dl>
        {!owner.verified && (
          <p className="text-muted-foreground border-t pt-4 text-xs">
            {owner.name} hasn&apos;t proved it holds a domain: its listings are community ones, and may not come from the brands&apos; owners.
          </p>
        )}
      </aside>
      <section className="min-w-0">
        <div className="mb-6 border-b">
          <TabNav label={owner.name} items={[{ href: `${base}/${owner.slug}`, label: "Brands", count: cards.length, current: true }]} />
        </div>
        <Cards cards={cards} base={base} className="lg:grid-cols-2 xl:grid-cols-3" />
      </section>
    </div>
  );
}
