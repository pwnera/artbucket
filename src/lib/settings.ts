import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { EmailSettings } from "./email.ts";
import { BrandingSettings, brandingFromEnv, DEFAULT_BRANDING } from "./branding.ts";
import { Limits, limitsFromEnv, UNLIMITED } from "./limits.ts";

/**
 * Settings, as definitions. Each says where it may be set (an organization,
 * a project, or both), its shape, its default, which of its properties are
 * secret, and how the server's own configuration spells it in the
 * environment. Adding a setting is adding an entry to SETTINGS; the store,
 * the API and the Settings page read them from here.
 *
 * Each place keeps only what it overrides, and a value resolves property by
 * property from the narrowest place that says something:
 *
 *   project  >  organization  >  environment (config files)  >  default
 *
 * so a server configured once serves every organization, and one of them can
 * change what the server leaves open. A `serverWins` setting the environment
 * sets is the server's alone: email, so no organization sends through the
 * server's account from an address of its choosing.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

export const SETTING_CONTEXTS = ["organization", "project"] as const;
export type SettingContext = (typeof SETTING_CONTEXTS)[number];
export type Source = SettingContext | "environment" | "default";

type Env = Record<string, string | undefined>;

type Definition<S extends z.ZodObject> = {
  label: string;
  schema: S;
  contexts: readonly SettingContext[];
  default: z.infer<S>;
  /** Encrypted at rest (seal), never sent back: the API says whether each is set. */
  secrets: readonly (keyof z.infer<S> & string)[];
  /** The server's configuration, or null when the environment says nothing. */
  fromEnv: (env: Env) => z.infer<S> | null;
  /** Set by whoever runs the server, in the environment or the database; never through the API. */
  operator?: true;
  /** Once the environment sets it, the server's alone: no place overrides it, and the API doesn't offer it. */
  serverWins?: true;
};

const define = <S extends z.ZodObject>(d: Definition<S>) => d;

/**
 * A word from whoever runs the server to an organization's admins, shown
 * across the top of the app until `until` (an ISO date), or until the row
 * goes: a plan that ends, a payment that failed. `href` is where to act.
 */
export const NoticeSettings = z.object({
  text: z.string().max(300),
  href: z.string().max(2000).nullable(),
  until: z.iso.datetime({ offset: true }).nullable(),
});
export type NoticeSettings = z.infer<typeof NoticeSettings>;

/** The notice to show now, or null: nothing said, or said for a time that has passed. */
export const noticeOf = (n: NoticeSettings, now = Date.now()) =>
  n.text && (n.until === null || Date.parse(n.until) > now) ? { text: n.text, href: n.href } : null;

export const SETTINGS = {
  email: define({
    label: "Email",
    schema: EmailSettings,
    contexts: ["organization"],
    default: { enabled: false, provider: "resend", from: "", replyTo: null, apiKey: null },
    secrets: ["apiKey"],
    // A hosted server sends from its own domain with its own key: an organization can't borrow either.
    serverWins: true,
    fromEnv: (env) => {
      const provider = env.EMAIL_PROVIDER?.trim();
      if (!provider) return null;
      return EmailSettings.parse({
        enabled: true,
        provider,
        from: env.EMAIL_FROM ?? "",
        replyTo: env.EMAIL_REPLY_TO || null,
        apiKey: env.EMAIL_API_KEY || null,
      });
    },
  }),
  branding: define({
    label: "Branding",
    schema: BrandingSettings,
    contexts: ["organization"],
    default: DEFAULT_BRANDING,
    secrets: [],
    fromEnv: brandingFromEnv,
  }),
  limits: define({
    label: "Limits",
    schema: Limits,
    contexts: ["organization"],
    default: UNLIMITED,
    secrets: [],
    fromEnv: limitsFromEnv,
    operator: true,
  }),
  notice: define({
    label: "Notice",
    schema: NoticeSettings,
    contexts: ["organization"],
    default: { text: "", href: null, until: null },
    secrets: [],
    fromEnv: () => null,
    operator: true,
  }),
};
export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;
/** What the API lists and changes: everything but the operator's. */
export const SETTING_KEYS = (Object.keys(SETTINGS) as SettingKey[]).filter((k) => !("operator" in SETTINGS[k]));

/** Whether the environment has taken this setting over (`serverWins`): then no organization or project sets it. */
export const lockedBy = (key: SettingKey, env: Env) => "serverWins" in SETTINGS[key] && SETTINGS[key].fromEnv(env) !== null;

type Layer = Record<string, unknown> | null | undefined;

/**
 * The value that applies, where it comes from as a whole (the narrowest
 * place that set any of it), and where each property comes from. `layers`
 * holds what each place stored, secrets opened.
 */
export function resolve<K extends SettingKey>(key: K, layers: Partial<Record<SettingContext, Layer>>, env: Env) {
  // What a place stored before the server took the setting over stays stored, and is ignored.
  const places = lockedBy(key, env) ? {} : layers;
  const order: [Source, Layer][] = [
    ["default", SETTINGS[key].default],
    ["environment", SETTINGS[key].fromEnv(env)],
    ["organization", places.organization],
    ["project", places.project],
  ];
  const value: Record<string, unknown> = {};
  const sources: Record<string, Source> = {};
  let source: Source = "default";
  for (const [from, layer] of order) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      value[k] = v;
      sources[k] = from;
    }
    if (from !== "default" && Object.keys(layer).length) source = from;
  }
  return { value: SETTINGS[key].schema.parse(value) as SettingValue<K>, source, sources };
}

/** What the API shows: the value with its secrets blanked, and which of them are set. */
export function present<K extends SettingKey>(key: K, value: SettingValue<K>) {
  const shown: Record<string, unknown> = { ...value };
  const set: Record<string, boolean> = {};
  for (const s of SETTINGS[key].secrets) {
    set[s] = !!shown[s];
    shown[s] = null;
  }
  return { value: shown as SettingValue<K>, secrets: set };
}

/**
 * A place's stored overrides after a change: properties left out stay as
 * they were, a blank secret too; null sets a property to nothing here.
 */
export function merge<K extends SettingKey>(key: K, stored: Layer, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(stored ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if ((SETTINGS[key].secrets as readonly string[]).includes(k) && v === "") continue;
    next[k] = v;
  }
  return SETTINGS[key].schema.partial().strict().parse(next);
}

// ---- secrets at rest ----------------------------------------------------------

const keyFrom = (secret: string) => createHash("sha256").update(`artbucket-settings:${secret}`).digest();

/** AES-256-GCM under a key derived from the server's secret: a leaked table leaks no API key. */
export function seal(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

/** Null when it can't be opened: sealed under another secret, or tampered with. */
export function unseal(sealed: string, secret: string): string | null {
  const [v, iv, tag, body] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Seal or open every secret property of a value. */
export function sealed<K extends SettingKey>(key: K, value: Record<string, unknown>, how: (s: string) => string | null) {
  const out = { ...value };
  for (const s of SETTINGS[key].secrets) if (typeof out[s] === "string" && out[s]) out[s] = how(out[s] as string);
  return out;
}
