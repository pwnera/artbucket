import { delay, http, HttpResponse } from "msw";
import type { Me } from "@/components/account";
import type { Asked, Key, Kept } from "@/components/agents";
import type { InvitationInfo } from "@/components/sign-in";
import { NOW, acme, northwind, source } from "./brands";

/**
 * Signing in and the account as stories see them: what /api/v1/me says about signing in on a server (`auth`), an
 * invitation, and better-auth at /api/auth answered and recorded (`betterAuth`). Made-up people at made-up addresses.
 */

/** A server with sign-up open, email on and terms to agree to: what each story changes. `signUp` is a fresh install. */
export const auth = (over: Partial<Me["auth"]> = {}): Me["auth"] => ({
  signUp: false,
  setupToken: false,
  open: true,
  oidc: null,
  google: false,
  sso: false,
  anonymous: null,
  passwordReset: true,
  serverEmail: true,
  captcha: null,
  turnstile: null,
  legal: { terms: "https://acme.test/legal/terms", privacy: "https://acme.test/legal/privacy" },
  ...over,
});

/** An invitation to edit the Acme organization, sent to someone without an account. */
export const invitation = (over: Partial<InvitationInfo> = {}): InvitationInfo => ({
  email: "lena@northwind.test",
  organization: "Acme",
  resource: "organization",
  label: null,
  scope: "write",
  invitedBy: "Ada Lovelace",
  expiresAt: new Date(NOW.getTime() + 6 * 86_400_000).toISOString(),
  signUp: true,
  ...over,
});

/** The six digits a story's email carries: any other code is wrong. */
export const CODE = "123456";

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> };
type Reply = Answer | ((body: Record<string, unknown>) => Answer);

/** better-auth's errors, as it answers them: a code the form turns into words. */
export const refuse = (code: string, status = 400, headers?: Record<string, string>): Answer => ({ status, body: { code, message: code }, headers });

/**
 * better-auth at /api/auth: `answers` by path ("sign-in/email"), each answer or a function of what was sent; every
 * other path answers `{}`. `set` changes them later (a story's own, after the meta's beforeEach made it). `sent` holds
 * each request's path and body, newest last. A sign-up makes an account waiting for its code, and the code is right
 * when it is CODE.
 */
export function betterAuth(answers: Record<string, Reply> = {}) {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const defaults: Record<string, Reply> = {
    "sign-in/email": { body: { token: "tok_dana" } },
    "sign-up/email": { body: { token: null } },
    "email-otp/verify-email": (b) => (b.otp === CODE ? { body: { status: true } } : refuse("INVALID_OTP")),
  };
  const handler = http.post("/api/auth/*", async ({ request }) => {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    sent.push({ path, body });
    await delay(100);
    const reply = answers[path] ?? defaults[path] ?? {};
    const a = typeof reply === "function" ? reply(body) : reply;
    return HttpResponse.json(a.body ?? {}, { status: a.status ?? 200, headers: a.headers });
  });
  return {
    handler,
    sent,
    set: (more: Record<string, Reply>) => void Object.assign(answers, more),
    last: (path: string) => sent.filter((s) => s.path === path).at(-1)?.body,
  };
}

// ---- agents and keys ----------------------------------------------------------------------------------------

const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** A key as GET /api/v1/keys lists it: one an admin made, never called, until `over` says otherwise. */
export const key = (over: Partial<Key> & Pick<Key, "id" | "name">): Key => ({
  prefix: "ab_3f9a",
  scope: "propose",
  createdAt: ago(30),
  lastUsedAt: null,
  calls: 0,
  owner: null,
  waiting: 0,
  projects: null,
  ...over,
});

/** Two agents people connected (OAuth names each after the client and its person) and two keys an admin made. */
export const keys: Key[] = [
  key({ id: "key_claude", name: "Claude (Ada Lovelace)", owner: "Ada Lovelace", lastUsedAt: ago(0.1), calls: 1_240, projects: ["Acme", "Northwind"] }),
  key({ id: "key_cursor", name: "Cursor (Omar Haddad)", owner: "Omar Haddad", scope: "write", lastUsedAt: ago(2), calls: 86, waiting: 2, projects: ["Acme"] }),
  key({ id: "key_n8n", name: "n8n nightly export", prefix: "ab_7c21", scope: "read", lastUsedAt: ago(1), calls: 30 }),
  key({ id: "key_ci", name: "CI release check", prefix: "ab_e04b", scope: "write" }),
];

/** What each agent asked for, the last 30 days: one busy client and a script whose key was revoked. */
export const asked: Asked = {
  days: 30,
  clients: [
    {
      client: "Claude (Ada Lovelace)",
      events: 1_240,
      tools: [
        { name: "brand_rules", calls: 610, failed: 2 },
        { name: "search_assets", calls: 420, failed: 0 },
      ],
      contexts: [{ context: "social", count: 300 }],
      refusals: { total: 3, reasons: [{ code: "expired", count: 3 }] },
      fetches: 400,
      searches: 120,
    },
    { client: "Old export script", events: 12, tools: [], contexts: [], refusals: { total: 0, reasons: [] }, fetches: 12, searches: 0 },
  ],
};

/** Brands kept in a Git repository too: Acme, with changes to bring in, and Northwind, never synced. */
export const kept: Kept[] = [
  { brand: acme, source: source.source!, connect: "https://app.artbucket.test/github?brand=acme" },
  { brand: northwind, source: { ...source.source!, remote: "https://github.com/northwind/design.git", path: "", pending: false, syncedAt: null }, connect: null },
];
