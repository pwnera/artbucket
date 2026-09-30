/**
 * How far a brand is from being worth sharing, as the few steps every brand
 * takes: its colors, faces, logo and voice (the rules the pages are drawn
 * from), pages that say something, a publish, and a portal. The builder and
 * the brand's Overview show it as the Brand Agent Score, and brand_status
 * hands it to agents, so a person and an agent read the same list, the same
 * score and the same next step.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type StepId = "colors" | "type" | "logo" | "voice" | "look" | "pages" | "publish" | "portal";

export type Step = {
  id: StepId;
  title: string;
  /** null: this caller can't tell (the portal step, without the right to manage portals). */
  done: boolean | null;
  /** What it stands at, or what is missing and why it matters. */
  detail: string;
  /** How an agent does it, with the tools by name. */
  agent: string;
  /** What it adds to the Brand Agent Score, of 100, once done. */
  points: number;
};

export type Readiness = {
  steps: Step[];
  /** Steps done, of the ones this caller can tell. */
  done: number;
  total: number;
  /** The first step not done: what to do now. null when the brand is ready. */
  next: StepId | null;
  /** The Brand Agent Score, 0 to 100: the steps done, weighed by what each gives an agent. */
  score: number;
};

export type ReadinessInput = {
  /** Every rule, context versions included: only keys, types and whether a rule has assets are read. */
  rules: { key: string; type: string; assets?: readonly unknown[] }[];
  /** The brand's theme settings, as stored: only what was set. */
  theme?: Record<string, unknown>;
  /** Each page's section count. */
  pages: { sections: number }[];
  /** The brand's history, newest first, as GET .../versions lists it; empty before the first edit. */
  versions: { publishedAt: string | Date | null; publishedBy?: string | null }[];
  /** The portals showing the brand; null when the caller can't list portals. */
  portals: { name: string }[] | null;
};

/** Who publishes a baseline carried over from before versions: not a person's publish. */
const SYSTEM = "artbucket";

/** Fewer sections than this, across every page, is a cover and little else. */
const THIN = 3;

export type PublishState = "never" | "behind" | "current";

/** Whether readers see the brand as it stands: never published, published with changes since, or up to date. */
export function publishState(versions: ReadinessInput["versions"]): PublishState {
  const [latest] = versions;
  if (latest?.publishedAt && latest.publishedBy !== SYSTEM) return "current";
  return versions.some((v) => v.publishedAt) ? "behind" : "never";
}

/**
 * Where readers stand, in the words the brand's header and the builder's
 * Release button both use: "@4 live · Unreleased changes", "@4 live · Up to
 * date", or "Never released". `live`: the number of the release readers see.
 */
export function liveLine(state: PublishState, live: number | null) {
  if (state === "never" || live === null) return "Never released";
  return `@${live} live · ${state === "behind" ? "Unreleased changes" : "Up to date"}`;
}

/** Somewhere readers get the live release: BrandHub, or a portal. */
export type LivePlace = { name: string; url: string };

/**
 * Where readers get the live release, as the brand's header lists it:
 * BrandHub while the brand is public there, then each portal showing it.
 * Null when the caller isn't told the portals (lib/core/brand-status.ts)
 * and BrandHub doesn't list it publicly: nowhere can't be told apart.
 */
export function livePlaces(hub: { visibility: string; url: string } | null, portals: LivePlace[] | null): LivePlace[] | null {
  const places = [...(hub?.visibility === "public" ? [{ name: "BrandHub", url: hub.url }] : []), ...(portals ?? []).map(({ name, url }) => ({ name, url }))];
  return places.length || portals ? places : null;
}

/** "on BrandHub, Press and Partners"; "Only the team" when nowhere. */
export const liveWhere = (places: LivePlace[]) => (places.length ? `on ${new Intl.ListFormat("en-GB").format(places.map((p) => p.name))}` : "Only the team");

/**
 * Which of a brand its Guidelines tab shows: the version the address asks
 * for (`?version=`), else the draft to whoever may edit it while it has
 * changes readers don't see, else the live release. Before the first
 * release the draft is all there is.
 */
export function shownVersion(asked: string | undefined, o: { edit: boolean; publish: PublishState; live: number | null }): "draft" | "live" {
  if (o.live === null) return "draft";
  if (asked === "draft" || asked === "live") return asked;
  return o.edit && o.publish === "behind" ? "draft" : "live";
}

/**
 * What each step weighs in the Brand Agent Score (PRD: it replaces the
 * launch checklist as the brand's health meter): how much an agent working
 * from the brand gains by it. The rules an agent reads before making
 * anything weigh most, the logo with its file above all, then a release,
 * which is what brand.json, llms.txt and the tokens serve; pages, a portal
 * and a look matter to people more than to agents. 100 in all.
 */
export const WEIGHTS: Record<StepId, number> = { colors: 15, type: 15, logo: 20, voice: 15, look: 5, pages: 10, publish: 15, portal: 5 };

/**
 * The score over the steps this caller can tell (a step whose `done` is null
 * counts for nothing either way), with each step's share of it: what doing it
 * adds. Pure, from the steps alone, so every surface derives the same.
 */
export function agentScore(steps: Pick<Step, "id" | "done">[]) {
  const known = steps.filter((s) => s.done !== null);
  const total = known.reduce((n, s) => n + WEIGHTS[s.id], 0);
  const share = (id: StepId) => (total ? Math.round((100 * WEIGHTS[id]) / total) : 0);
  const got = known.filter((s) => s.done).reduce((n, s) => n + WEIGHTS[s.id], 0);
  return { score: total ? Math.round((100 * got) / total) : 0, points: (id: StepId) => (known.some((s) => s.id === id) ? share(id) : 0) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The layout settings a look sets (lib/brand-theme.ts LAYOUT_KEYS): any of them set, and the pages don't wear the default look. */
const LAYOUT = ["width", "density", "scale", "radius", "nav", "toc", "header", "separation", "numbering", "motion", "titles", "grounds"];

export function readiness({ rules, theme = {}, pages, versions, portals }: ReadinessInput): Readiness {
  const keys = new Map<string, ReadinessInput["rules"]>();
  for (const r of rules) keys.set(r.key, [...(keys.get(r.key) ?? []), r]);
  const of = (test: (key: string, type: string) => boolean) => [...keys.entries()].filter(([k, rs]) => test(k, rs[0].type));
  const colors = of((_, t) => t === "color");
  const faces = of((_, t) => t === "font");
  const logos = of((k) => k.startsWith("logo.")).filter(([, rs]) => rs.some((r) => r.assets?.length));
  const voice = of((k) => k.startsWith("tone.") || k.startsWith("voice."));
  const looked = LAYOUT.some((k) => theme[k] !== undefined && theme[k] !== null);
  const sections = pages.reduce((n, p) => n + p.sections, 0);
  const state = publishState(versions);

  const checks: Omit<Step, "points">[] = [
    {
      id: "colors",
      title: "Colors",
      done: colors.length > 0,
      detail: colors.length ? plural(colors.length, "color") : "Add the main color: the pages take their accent from it.",
      agent: 'set_rules with { key: "color.primary", type: "color", value: "#rrggbb" }, and more colors beside it.',
    },
    {
      id: "type",
      title: "Typefaces",
      done: faces.length > 0,
      detail: faces.length ? plural(faces.length, "typeface") : "Name a heading face and a text face: the pages are set in them.",
      agent: 'import_google_font for each family, then set_rules with { key: "type.heading", type: "font", value: { family } } and type.body.',
    },
    {
      id: "logo",
      title: "Logo",
      done: logos.length > 0,
      detail: logos.length ? "In the rules, with its file" : "Attach the logo file to a logo rule: covers and the header show it.",
      agent: 'ingest_asset the logo, then set_rules with { key: "logo.primary", type: "text", value, assets: [{ id }] }.',
    },
    {
      id: "voice",
      title: "Voice",
      done: voice.length > 0,
      detail: voice.length ? plural(voice.length, "rule") : "Say how the brand sounds, in a sentence or two.",
      agent: 'set_rules with { key: "tone.voice", type: "text", value }, and lists like tone.avoid.',
    },
    {
      id: "look",
      title: "Look",
      done: looked,
      detail: looked ? "The pages have a look of their own" : "The pages wear the default look, the same as every brand's: pick one that fits how the brand feels.",
      agent: 'get_theme lists the looks; set_theme with { look: "editorial" } (or documentation, swiss, bold, cinematic, playful), then any setting beside it. Read the playbook first.',
    },
    {
      id: "pages",
      title: "Pages",
      done: sections >= THIN,
      detail: !pages.length
        ? "Lay out the pages: they can start from the rules."
        : sections < THIN
          ? "The pages hold little beyond a cover: add sections that show the rules."
          : `${plural(pages.length, "page")}, ${plural(sections, "section")}`,
      agent: pages.length
        ? "list_templates, then edit_page or save_page to add sections that bind the rules by key. The playbook (brand_playbook) says what a good page is."
        : "Read brand_playbook, then save_page each page it describes; generate_pages lays out a plain start from the rules instead.",
    },
    {
      id: "publish",
      title: "Released",
      done: state === "current",
      detail: state === "current" ? "Readers see the latest" : state === "behind" ? "There are changes readers don't see yet." : "Never released: portals show nothing of it.",
      agent: "publish with a note, once the person asks for it.",
    },
    {
      id: "portal",
      title: "Shared",
      done: portals === null ? null : portals.length > 0,
      detail:
        portals === null
          ? "Someone who manages portals can share it."
          : portals.length
            ? `On ${portals.map((p) => p.name).join(", ")}`
            : "No portal shows it yet: add it to one so people outside the team can read it.",
      agent: "create_portal with the brand in `brands` (members, or public once the person says so), or list_portals, then update_portal with it added to one.",
    },
  ];
  const { score, points } = agentScore(checks);
  const steps: Step[] = checks.map((s) => ({ ...s, points: points(s.id) }));
  const known = steps.filter((s) => s.done !== null);
  return {
    steps,
    done: known.filter((s) => s.done).length,
    total: known.length,
    next: known.find((s) => !s.done)?.id ?? null,
    score,
  };
}
