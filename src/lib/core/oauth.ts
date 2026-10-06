import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, oauthClients, verifications } from "@/lib/db/schema";
import { keyWorkspaces, workspacesOf, type Caller } from "@/lib/core/access";
import { isAppOrigin } from "@/lib/core/domains";
import { AssetError } from "@/lib/core/errors";
import { hashKey } from "@/lib/core/keys";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit } from "@/lib/core/usage";
import { accessIn, lowest, widest } from "@/lib/access";
import { env } from "@/lib/env";
import { askedScope, cappedScope, Consent, GRANTABLE, normalizeCode, pkceMatches, redirectAllowed, userCode, type Grantable } from "@/lib/oauth";
import type { Scope } from "@/lib/scopes";

/**
 * An OAuth 2.1 authorization server for agents (the MCP authorization spec):
 * chat apps register themselves, send the person here to consent, and trade
 * the code for a token; the CLI does the same through the device flow. What
 * they get is an API key, bound to the person who consented: it never does
 * more than they can (lib/core/access.ts), shows up in Connected agents with
 * every other key, and is revoked the same way.
 *
 * A token works for an hour (TOKEN_TTL) and comes with a refresh token that
 * renews it, each renewal replacing both (OAuth 2.1 rotation), for as long as
 * the agent renews within REFRESH_TTL. A client that registered without the
 * refresh_token grant gets a token for NO_REFRESH_TTL and nothing to renew it.
 * What can no longer be renewed is swept (sweepTokens), with clients long
 * unused.
 *
 * ponytail: a refresh token used twice fails the second time, nothing more;
 * revoking the whole connection on reuse waits for a client that needs it.
 */

/** An error the OAuth way, `{error, error_description}` (RFC 6749 §5.2), not the API's shape. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const CODE_TTL = 10 * 60_000;
const DAY = 86_400_000;
export const TOKEN_TTL = 60 * 60_000;
export const REFRESH_TTL = 90 * DAY;
const NO_REFRESH_TTL = 30 * DAY;
/** How often the CLI may ask whether its code was approved yet. */
export const DEVICE_INTERVAL = 5;

export const mcpUrl = () => `${env.APP_URL}/api/v1/mcp`;

/** RFC 8414: where everything is. The issuer is the app itself. */
export const serverMetadata = () => ({
  issuer: env.APP_URL,
  authorization_endpoint: `${env.APP_URL}/oauth/authorize`,
  token_endpoint: `${env.APP_URL}/api/v1/oauth/token`,
  registration_endpoint: `${env.APP_URL}/api/v1/oauth/register`,
  device_authorization_endpoint: `${env.APP_URL}/api/v1/oauth/device`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [...GRANTABLE],
  service_documentation: `${env.APP_URL}/connections`,
});

/** RFC 9728: the MCP endpoint, and who hands out tokens for it. */
export const resourceMetadata = () => ({
  resource: mcpUrl(),
  authorization_servers: [env.APP_URL],
  scopes_supported: [...GRANTABLE],
  bearer_methods_supported: ["header"],
  resource_name: "artbucket",
  resource_documentation: `${env.APP_URL}/connections`,
});

// ---- clients ----------------------------------------------------------------

const Registration = z.object({
  client_name: z.string().trim().max(120).optional(),
  redirect_uris: z.array(z.string().max(2048)).max(10).default([]),
  grant_types: z.array(z.string()).default(["authorization_code"]),
});

/** RFC 7591 dynamic registration: anyone may register; consenting is what takes a person. */
export async function registerClient(input: unknown) {
  const parsed = Registration.safeParse(input);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", z.prettifyError(parsed.error));
  const { client_name, redirect_uris, grant_types } = parsed.data;
  const bad = redirect_uris.find((u) => !redirectAllowed(u));
  if (bad !== undefined) throw new OAuthError("invalid_redirect_uri", `Not a redirect this server sends codes to: ${bad}`);
  if (grant_types.includes("authorization_code") && !redirect_uris.length) {
    throw new OAuthError("invalid_redirect_uri", "The authorization code flow needs at least one redirect_uri");
  }
  const [row] = await db
    .insert(oauthClients)
    .values({ id: `abc_${randomBytes(16).toString("base64url")}`, name: client_name || "An agent", redirectUris: redirect_uris, grantTypes: grant_types })
    .returning();
  return {
    client_id: row.id,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    grant_types,
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

async function clientOf(id: string | null | undefined) {
  const [row] = id ? await db.select().from(oauthClients).where(eq(oauthClients.id, id)) : [];
  return row ?? null;
}

/**
 * RFC 8707: a `resource` a client names must be what this server's tokens
 * are for, its API: the MCP endpoint, or the API or the app it is under, at
 * APP_URL or an organization's domain for the app.
 */
async function served(resource: string | undefined) {
  if (!resource) return true;
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  return !url.hash && ["", "/api/v1", "/api/v1/mcp"].includes(url.pathname.replace(/\/+$/, "")) && (await isAppOrigin(url.origin));
}
const notServed = (resource: string) => `Tokens here are for ${mcpUrl()}, not ${resource}`;

// ---- consent ----------------------------------------------------------------

/** The workspaces a person can give an agent, each with the most it may do there: theirs, up to write. */
export async function consentOptions(caller: Caller) {
  if (!caller.user) throw new AssetError("forbidden", "Sign in to connect an agent");
  const { grants, workspaces } = await workspacesOf(caller.user.id);
  const options = workspaces.flatMap((w) => {
    const max = lowest(widest(accessIn(grants, w)), "write") as Grantable | null;
    return max ? [{ id: w.id, name: w.name, organization: w.organization.name, organizationId: w.organizationId, max }] : [];
  });
  return { workspaces: options, workspace: options.some((o) => o.id === caller.workspace.id) ? caller.workspace.id : (options[0]?.id ?? null) };
}

type ConsentInput = z.infer<typeof Consent>;

/**
 * What was consented to, checked against what the person may give: in each
 * workspace picked, the scope asked brought down to the most they may give
 * there, as the consent screen shows it.
 */
async function granted(caller: Caller, input: Extract<ConsentInput, { allow: true }>) {
  const options = (await consentOptions(caller)).workspaces;
  const ids = input.workspaces ?? (input.workspace ? [input.workspace] : []);
  if (!ids.length) throw new AssetError("invalid", "Pick a workspace");
  const picked = [...new Set(ids)].map((id) => {
    const option = options.find((w) => w.id === id);
    if (!option) throw new AssetError("forbidden", "You have nothing in that workspace to give");
    return { id, organizationId: option.organizationId, scope: cappedScope(input.scope, option.max) };
  });
  for (const org of new Set(picked.map((w) => w.organizationId))) await checkLimit(org, "agents");
  return { userId: caller.user!.id, userName: caller.user!.name || caller.user!.email, workspaces: picked.map(({ id, scope }) => ({ id, scope })) };
}
type Granted = Awaited<ReturnType<typeof granted>>;

/** An agent a person connected, by any of its rows: theirs alone to change. */
async function connectionOf(caller: Caller, keyId: string) {
  if (!caller.user) return null;
  const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, caller.user.id)));
  return key ?? null;
}

/** GET /api/v1/keys/{id}: an agent you connected, where it works, and where you could let it work. */
export async function getConnection(caller: Caller, keyId: string) {
  const key = await connectionOf(caller, keyId);
  if (!key) return null;
  const [workspaces, { workspaces: givable }] = await Promise.all([keyWorkspaces(key.id), consentOptions(caller)]);
  return { id: key.id, name: key.name, workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, organization: w.organization.name, scope: w.scope })), givable };
}

/**
 * PATCH /api/v1/keys/{id}: an agent you connected, given other workspaces or
 * another scope, as the consent screen gives them. Its secret stays: rows
 * come, go and change around it, so the agent never signs in again.
 */
export async function regrant(caller: Caller, keyId: string, input: { workspaces: string[]; scope: Grantable }) {
  const key = await connectionOf(caller, keyId);
  if (!key) return null;
  const g = await granted(caller, { allow: true, ...input });
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.hash, key.hash), eq(apiKeys.userId, key.userId!)));
  const keep = new Set(g.workspaces.map((w) => w.id));
  const open = (await workspacesOf(g.userId)).workspaces;
  const audit = (workspaceId: string, action: "key.created" | "key.revoked", scope: Scope) => {
    const workspace = open.find((w) => w.id === workspaceId);
    return workspace ? recordAudit({ ...caller, workspace }, action, key.name, { scope, via: "connections" }) : null;
  };
  await db.transaction(async (tx) => {
    const gone = rows.filter((r) => !keep.has(r.workspaceId)).map((r) => r.id);
    if (gone.length) await tx.delete(apiKeys).where(inArray(apiKeys.id, gone));
    for (const w of g.workspaces) {
      const row = rows.find((r) => r.workspaceId === w.id);
      if (row && row.scope !== w.scope) await tx.update(apiKeys).set({ scope: w.scope }).where(eq(apiKeys.id, row.id));
      if (!row) {
        const { prefix, hash, expiresAt, refreshHash, refreshExpiresAt, clientId } = key;
        await tx.insert(apiKeys).values({ name: key.name, scope: w.scope, workspaceId: w.id, userId: key.userId, prefix, hash, expiresAt, refreshHash, refreshExpiresAt, clientId });
      }
    }
  });
  for (const r of rows) if (!keep.has(r.workspaceId)) await audit(r.workspaceId, "key.revoked", r.scope);
  for (const w of g.workspaces) {
    const row = rows.find((r) => r.workspaceId === w.id);
    if (!row || row.scope !== w.scope) await audit(w.id, "key.created", w.scope);
  }
  const [any] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.hash, key.hash)).limit(1);
  return getConnection(caller, any.id);
}

export const AuthorizeRequest = z.object({
  response_type: z.literal("code", { error: "Only response_type=code is supported" }),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128, { error: "A PKCE code_challenge is required" }),
  code_challenge_method: z.literal("S256", { error: "PKCE with S256 is required" }),
  state: z.string().max(2048).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().optional(),
});
export type AuthorizeRequest = z.infer<typeof AuthorizeRequest>;

/**
 * Who is asking, before the person decides. A bad client or redirect is
 * shown, never followed: that is how open redirects happen.
 */
export async function checkAuthorize(caller: Caller, params: Record<string, string>) {
  const parsed = AuthorizeRequest.safeParse(params);
  if (!parsed.success) throw new AssetError("invalid", parsed.error.issues[0].message);
  const client = await clientOf(parsed.data.client_id);
  if (!client) throw new AssetError("not_found", "This agent isn't registered here. Start connecting again from the agent.");
  if (!client.redirectUris.includes(parsed.data.redirect_uri)) throw new AssetError("invalid", "This agent didn't register that redirect_uri");
  if (!(await served(parsed.data.resource))) throw new AssetError("invalid", notServed(parsed.data.resource!));
  return { request: parsed.data, client: { name: client.name }, scope: askedScope(parsed.data.scope) ?? "propose", ...(await consentOptions(caller)) };
}

const back = (redirectUri: string, params: Record<string, string | undefined>) => {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
};

/** The person decided: where to send their browser, with a code or with a refusal. */
export async function decideAuthorize(caller: Caller, params: Record<string, string>, input: ConsentInput) {
  const { request } = await checkAuthorize(caller, params);
  const reply = { state: request.state, iss: env.APP_URL };
  if (!input.allow) return { redirect: back(request.redirect_uri, { error: "access_denied", ...reply }) };
  const grant = await granted(caller, input);
  const code = randomBytes(32).toString("base64url");
  await remember(`oauth-code:${hashKey(code)}`, {
    ...grant,
    clientId: request.client_id,
    redirectUri: request.redirect_uri,
    challenge: request.code_challenge,
  });
  return { redirect: back(request.redirect_uri, { code, ...reply }) };
}

// ---- the device flow, for the CLI -------------------------------------------

/** `asked`: the scope the client asked for (RFC 8628 allows `scope`), which the consent screen offers first. */
type Device = { clientId: string; secret: string; asked?: Grantable } & ({ status: "pending" } | { status: "denied" } | ({ status: "approved" } & Granted));

/** RFC 8628: the CLI asks for a code, the person approves it on /device, the CLI polls for its key. */
export async function startDevice(clientId: string | null, scope?: string | null, resource?: string) {
  const client = await clientOf(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id: register first");
  if (!(await served(resource))) throw new OAuthError("invalid_target", notServed(resource!));
  const code = userCode();
  const secret = randomBytes(32).toString("base64url");
  const asked = askedScope(scope) ?? undefined;
  await remember(`oauth-device:${code}`, { clientId: client.id, secret: hashKey(secret), asked, status: "pending" } satisfies Device);
  return {
    // The user code rides along, so polling finds the row; the secret is what proves it's the CLI.
    device_code: `${code}.${secret}`,
    user_code: code,
    verification_uri: `${env.APP_URL}/device`,
    verification_uri_complete: `${env.APP_URL}/device?code=${code}`,
    expires_in: CODE_TTL / 1000,
    interval: DEVICE_INTERVAL,
  };
}

async function pendingDevice(typed: string) {
  const code = normalizeCode(typed);
  const row = code ? await recall<Device>(`oauth-device:${code}`) : null;
  if (!row || row.value.status !== "pending") throw new AssetError("not_found", "No such code, or it expired. Run artbucket login again.");
  return row;
}

/** What /device shows before the person approves: which client, and what they can give it. */
export async function checkDevice(caller: Caller, typed: string) {
  const row = await pendingDevice(typed);
  const client = await clientOf(row.value.clientId);
  return { client: { name: client?.name ?? "An agent" }, scope: row.value.asked ?? ("propose" as Grantable), ...(await consentOptions(caller)) };
}

export async function decideDevice(caller: Caller, typed: string, input: ConsentInput) {
  const row = await pendingDevice(typed);
  const value: Device = input.allow ? { ...row.value, ...(await granted(caller, input)), status: "approved" } : { ...row.value, status: "denied" };
  await db.update(verifications).set({ value: JSON.stringify(value), updatedAt: new Date() }).where(eq(verifications.id, row.id));
  return { allowed: input.allow };
}

// ---- tokens -----------------------------------------------------------------

/** POST /api/v1/oauth/token: a code, an approved device code, or a refresh token, for a key. */
export async function exchange(form: Record<string, string>) {
  if (!(await served(form.resource))) throw new OAuthError("invalid_target", notServed(form.resource));
  if (form.grant_type === "refresh_token") return renew(form.refresh_token ?? "", form.client_id ?? "");
  if (form.grant_type === "authorization_code") {
    const row = await take<Granted & { clientId: string; redirectUri: string; challenge: string }>(`oauth-code:${hashKey(form.code ?? "")}`);
    if (!row) throw new OAuthError("invalid_grant", "The code is unknown, used or expired");
    const c = row.value;
    if (c.clientId !== form.client_id || c.redirectUri !== form.redirect_uri) throw new OAuthError("invalid_grant", "The code was issued to another client or redirect");
    if (!pkceMatches(form.code_verifier ?? "", c.challenge)) throw new OAuthError("invalid_grant", "code_verifier doesn't match the code_challenge");
    return mint(c.clientId, c);
  }
  if (form.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
    const [code, secret] = (form.device_code ?? "").split(".");
    const row = await recall<Device>(`oauth-device:${code}`);
    if (!row || row.value.secret !== hashKey(secret ?? "")) throw new OAuthError("expired_token", "The device code is unknown or expired");
    const device = row.value;
    if (device.clientId !== form.client_id) throw new OAuthError("invalid_grant", "The device code was issued to another client");
    if (device.status === "pending") throw new OAuthError("authorization_pending", "Waiting for someone to approve the code");
    // Deleted and checked in one go: of two polls racing for an approved code, one gets the key.
    const [gone] = await db.delete(verifications).where(eq(verifications.id, row.id)).returning({ id: verifications.id });
    if (!gone) throw new OAuthError("expired_token", "The device code is unknown or expired");
    if (device.status === "denied") throw new OAuthError("access_denied", "The code was turned down");
    return mint(device.clientId, device);
  }
  throw new OAuthError("unsupported_grant_type", `grant_type must be authorization_code, refresh_token or the device code grant`);
}

type Client = typeof oauthClients.$inferSelect;

/**
 * A new token for a client, and a refresh token when the client renews
 * (it registered the refresh_token grant, or registered before grants were
 * kept): the columns the key's rows take, and what to answer.
 */
function issue(client: Client) {
  const renews = !client.grantTypes || client.grantTypes.includes("refresh_token");
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const refresh = renews ? `abr_${randomBytes(32).toString("base64url")}` : null;
  const ttl = renews ? TOKEN_TTL : NO_REFRESH_TTL;
  const now = Date.now();
  return {
    columns: {
      prefix: secret.slice(0, 10),
      hash: hashKey(secret),
      expiresAt: new Date(now + ttl),
      refreshHash: refresh && hashKey(refresh),
      refreshExpiresAt: refresh ? new Date(now + REFRESH_TTL) : null,
      clientId: client.id,
    },
    answer: (scope: Scope) => ({ access_token: secret, token_type: "Bearer", scope, expires_in: ttl / 1000, ...(refresh && { refresh_token: refresh }) }),
  };
}

const used = (clientId: string) => db.update(oauthClients).set({ usedAt: new Date() }).where(eq(oauthClients.id, clientId));

/**
 * The refresh grant: a new token and refresh token for every row of the
 * connection, the old ones dead from here. Only the client it was issued
 * to may, and only once: of two racing, one gets the pair.
 */
async function renew(token: string, clientId: string) {
  const client = await clientOf(clientId);
  const fresh = client && issue(client);
  const rows = fresh
    ? await db
        .update(apiKeys)
        .set(fresh.columns)
        .where(and(eq(apiKeys.refreshHash, hashKey(token)), gt(apiKeys.refreshExpiresAt, sql`now()`), eq(apiKeys.clientId, client.id)))
        .returning({ scope: apiKeys.scope, createdAt: apiKeys.createdAt, id: apiKeys.id })
    : [];
  if (!rows.length) throw new OAuthError("invalid_grant", "The refresh token is unknown, used or expired: connect again");
  await used(client!.id);
  // The scope of the first workspace given, as when it was minted.
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return fresh!.answer(rows[0].scope);
}

/**
 * The token is a key: named for the agent and its person, so history and
 * Review say whose it was. One secret, a row in each workspace given.
 */
async function mint(clientId: string, g: Granted) {
  // Swept between consent and exchange (sweepTokens): the agent registers again.
  const client = await clientOf(clientId);
  if (!client) throw new OAuthError("invalid_client", "This client is no longer registered: connect again");
  const fresh = issue(client);
  const name = `${client.name} (${g.userName})`.slice(0, 120);
  const now = Date.now();
  const keys = await db
    .insert(apiKeys)
    // A millisecond apart, in the order picked: the first is where a call that names no workspace goes.
    .values(g.workspaces.map((w, i) => ({ name, scope: w.scope, workspaceId: w.id, userId: g.userId, ...fresh.columns, createdAt: new Date(now + i) })))
    .returning();
  await used(client.id);
  const open = (await workspacesOf(g.userId)).workspaces;
  for (const k of keys) {
    const workspace = open.find((w) => w.id === k.workspaceId);
    if (workspace) await recordAudit({ actor: g.userName, user: { id: g.userId }, workspace }, "key.created", name, { scope: k.scope, via: "oauth" });
  }
  return fresh.answer(keys[0].scope);
}

/**
 * Tokens that can no longer be renewed, and clients unused for long that
 * hold no key: a week after registering if nothing was ever issued to them
 * (a registration nobody finished), else REFRESH_TTL after the last token.
 * At boot and every six hours (core/sweep.ts).
 */
export async function sweepTokens() {
  const keys = await db
    .delete(apiKeys)
    .where(and(lt(apiKeys.expiresAt, sql`now()`), sql`(${apiKeys.refreshExpiresAt} is null or ${apiKeys.refreshExpiresAt} < now())`))
    .returning({ id: apiKeys.id });
  const clients = await db
    .delete(oauthClients)
    .where(
      and(
        sql`coalesce(${oauthClients.usedAt} + make_interval(days => ${REFRESH_TTL / DAY}), ${oauthClients.createdAt} + interval '7 days') < now()`,
        notExists(db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.clientId, oauthClients.id))),
      ),
    )
    .returning({ id: oauthClients.id });
  return { keys: keys.length, clients: clients.length };
}

// ---- codes waiting, in better-auth's verifications table ----------------------

async function remember(identifier: string, value: unknown) {
  // Old codes go as new ones come: nothing else sweeps them.
  await db.delete(verifications).where(lt(verifications.expiresAt, new Date()));
  await db.insert(verifications).values({ id: randomUUID(), identifier, value: JSON.stringify(value), expiresAt: new Date(Date.now() + CODE_TTL) });
}

async function recall<T>(identifier: string) {
  const [row] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.identifier, identifier), gt(verifications.expiresAt, new Date())));
  return row ? { id: row.id, value: JSON.parse(row.value) as T } : null;
}

/** Read and delete in one go: a code works once, even when two requests race for it. */
async function take<T>(identifier: string) {
  const [row] = await db
    .delete(verifications)
    .where(and(eq(verifications.identifier, identifier), gt(verifications.expiresAt, new Date())))
    .returning();
  return row ? { id: row.id, value: JSON.parse(row.value) as T } : null;
}
