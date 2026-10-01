import { z } from "zod";
import { isFont } from "./font.ts";

/**
 * Rights and provenance: what an asset may be used for, and where it came
 * from. `/api/v1/check` turns the first into a verdict; lib/core/check.ts
 * adds what needs the database (review status, replacements, brand variants).
 *
 * Pure, like lib/rules.ts: `pnpm test` runs it under plain Node.
 */

export const ORIGINS = ["shot", "licensed", "generated"] as const;
export type Origin = (typeof ORIGINS)[number];

/** `missing`: people in it have not signed one. `not-needed`: nobody recognizable is in it. */
export const MODEL_RELEASES = ["released", "missing", "not-needed"] as const;

/** Suggestions for the channel field; any slug is allowed. */
export const CHANNELS = ["web", "social", "paid-social", "email", "print", "out-of-home", "broadcast", "editorial"];

const day = z.iso.date();
const territory = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "A two-letter country code, e.g. DE");
const channel = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "A slug, e.g. paid-social");
const set = <T extends z.ZodType<string>>(item: T, max: number) =>
  z.array(item).max(max).transform((xs) => [...new Set(xs)]);

export const RightsInput = z
  .strictObject({
    license: z.string().trim().max(200).nullable().optional().describe('e.g. "Royalty-free", "CC BY 4.0", "Getty, rights-managed"'),
    territories: set(territory, 250).optional().describe("Countries it may run in (ISO 3166-1 alpha-2); empty: anywhere"),
    channels: set(channel, 50).optional().describe("What it may be used for, e.g. web, print, paid-social; empty: anything"),
    embargo: day.nullable().optional().describe("Not to be used before this day"),
    expires: day.nullable().optional().describe("The last day it may be used"),
    modelRelease: z.enum(MODEL_RELEASES).nullable().optional(),
    downloadable: z
      .boolean()
      .nullable()
      .optional()
      .describe("Whether people outside the workspace may download the file itself; null follows its license (isDownloadable). Either way they see it."),
  })
  .refine((r) => !r.embargo || !r.expires || r.embargo <= r.expires, "The embargo lifts after it expires")
  .transform(
    (r): Rights => ({
      license: r.license || null,
      territories: r.territories ?? [],
      channels: r.channels ?? [],
      embargo: r.embargo ?? null,
      expires: r.expires ?? null,
      modelRelease: r.modelRelease ?? null,
      downloadable: r.downloadable ?? null,
    }),
  );

export type Rights = {
  license: string | null;
  territories: string[];
  channels: string[];
  embargo: string | null;
  expires: string | null;
  modelRelease: (typeof MODEL_RELEASES)[number] | null;
  /** Set by a person; null (or missing, in rights stored before it) follows the license. */
  downloadable?: boolean | null;
};

/** Rights that say nothing are no rights: stored as null. */
export const isEmpty = (r: Rights) =>
  !r.license && !r.territories.length && !r.channels.length && !r.embargo && !r.expires && !r.modelRelease && r.downloadable == null;

/** A license that lets anyone pass the file on: the open font licenses, Creative Commons, the public domain. */
export const OPEN_LICENSE =
  /open font licen[cs]e|\bOFL\b|apache licen[cs]e|ubuntu font licen[cs]e|\bMIT\b|creative commons|\bCC[ -]?(BY|0)\b|public domain|\bunlicense\b/i;

/**
 * Whether people outside the workspace may take the file itself: download
 * it, or fetch it from anywhere but a page of this app that shows it. Either
 * way they see it, at a preview's size (lib/transform.ts SHOWN_MAX). A person
 * decides; until then, a font goes out only under an open license (an upload
 * takes the one its file names, lib/font-license.ts), anything licensed only
 * under an open one, and everything else does.
 */
export function isDownloadable(a: { rights: Rights | null; origin: Origin | null; mime: string; filename: string }) {
  if (a.rights?.downloadable != null) return a.rights.downloadable;
  const open = !!a.rights?.license && OPEN_LICENSE.test(a.rights.license);
  if (isFont(a.mime, a.filename)) return open;
  return a.origin !== "licensed" || open;
}

export const Use = z.strictObject({
  channel: channel.optional().describe("Where it will run, e.g. paid-social"),
  territory: territory.optional().describe("The country it will run in, e.g. DE"),
  date: day.optional().describe("The day it will run; today when left out"),
});
export type Use = z.infer<typeof Use>;

export type ReasonCode =
  | "not_approved"
  | "deleted"
  | "archived"
  | "superseded"
  | "embargoed"
  | "expired"
  | "territory"
  | "channel"
  | "model_release"
  | "context";

/** Why a use is refused (`blocking`), or what to know before going ahead. */
export type Reason = { code: ReasonCode; message: string; blocking: boolean };

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * What the rights say about one use. A restriction the use doesn't say
 * anything about (no territory given, say) is a warning, not a refusal:
 * the caller learns what to ask.
 */
export function rightsReasons(rights: Rights | null, use: Use): Reason[] {
  if (!rights) return [];
  const date = use.date ?? today();
  const out: Reason[] = [];
  const block = (code: ReasonCode, message: string) => out.push({ code, message, blocking: true });
  const warn = (code: ReasonCode, message: string) => out.push({ code, message, blocking: false });
  const only = (xs: string[]) => `${xs.join(", ")} only`;

  if (rights.embargo && date < rights.embargo) block("embargoed", `Embargoed until ${rights.embargo}`);
  if (rights.expires && date > rights.expires) block("expired", `License expired after ${rights.expires}`);
  if (rights.territories.length) {
    if (!use.territory) warn("territory", `Licensed for ${only(rights.territories)}; say where it will run`);
    else if (!rights.territories.includes(use.territory)) block("territory", `Not licensed in ${use.territory}: ${only(rights.territories)}`);
  }
  if (rights.channels.length) {
    if (!use.channel) warn("channel", `Licensed for ${only(rights.channels)}; say what it is for`);
    else if (!rights.channels.includes(use.channel)) block("channel", `Not licensed for ${use.channel}: ${only(rights.channels)}`);
  }
  if (rights.modelRelease === "missing" && use.channel !== "editorial") {
    const message = "People in it have not signed a model release: editorial use only";
    if (use.channel) block("model_release", message);
    else warn("model_release", message);
  }
  return out;
}
