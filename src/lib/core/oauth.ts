import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, oauthClients, verifications } from "@/lib/db/schema";
import { workspacesOf, type Caller } from "@/lib/core/access";
import { AssetError } from "@/lib/core/errors";
import { hashKey } from "@/lib/core/keys";
import { recordAudit } from "@/lib/core/audit";
import { accessIn, lowest, widest } from "@/lib/access";
import { env } from "@/lib/env";
import { Consent, GRANTABLE, normalizeCode, pkceMatches, redirectAllowed, userCode, type Grantable } from "@/lib/oauth";
import { SCOPES } from "@/lib/scopes";

/**
 * An OAuth 2.1 authorization server for agents (the MCP authorization spec):
 * chat apps register themselves, send the person here to consent, and trade
 * the code for a token; the CLI does the same through the device flow. What
 * they get is an API key, bound to the person who consented: it never does
 * more than they can (lib/core/access.ts), shows up in Connected agents with
 * every other key, and is revoked the same way.
 *
 * ponytail: tokens don't expire and there are no refresh tokens: a key lives
 * until someone revokes it, like one an admin makes. Add expiry and refresh
 * when a client insists on them.
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
  grant_types_supported: ["authorization_code", "urn:ietf:params:oauth:grant-type:device_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [...GRANTABLE],
  service_documentation: `${env.APP_URL}/agents`,
});

/** RFC 9728: the MCP endpoint, and who hands out tokens for it. */
export const resourceMetadata = () => ({
  resource: mcpUrl(),
  authorization_servers: [env.APP_URL],
  scopes_supported: [...GRANTABLE],
  bearer_methods_supported: ["header"],
  resource_name: "artbucket",
  resource_documentation: `${env.APP_URL}/agents`,
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
  if (bad) throw new OAuthError("invalid_redirect_uri", `Not a redirect this server sends codes to: ${bad}`);
  if (grant_types.includes("authorization_code") && !redirect_uris.length) {
    throw new OAuthError("invalid_redirect_uri", "The authorization code flow needs at least one redirect_uri");
  }
  const [row] = await db
    .insert(oauthClients)
    .values({ id: `abc_${randomBytes(16).toString("base64url")}`, name: client_name || "An agent", redirectUris: redirect_uris })
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

// ---- consent ----------------------------------------------------------------

/** The workspaces a person can give an agent, each with the most it may do there: theirs, up to write. */
export async function consentOptions(caller: Caller) {
  if (!caller.user) throw new AssetError("forbidden", "Sign in to connect an agent");
  const { grants, workspaces } = await workspacesOf(caller.user.id);
  const options = workspaces.flatMap((w) => {
    const max = lowest(widest(accessIn(grants, w)), "write") as Grantable | null;
    return max ? [{ id: w.id, name: w.name, organization: w.organization.name, max }] : [];
  });
  return { workspaces: options, workspace: options.some((o) => o.id === caller.workspace.id) ? caller.workspace.id : (options[0]?.id ?? null) };
}

type ConsentInput = z.infer<typeof Consent>;

/** What was consented to, checked against what the person may give. */
async function granted(caller: Caller, input: Extract<ConsentInput, { allow: true }>) {
  const option = (await consentOptions(caller)).workspaces.find((w) => w.id === input.workspace);
  if (!option) throw new AssetError("forbidden", "You have nothing in that workspace to give");
  if (SCOPES.indexOf(input.scope) > SCOPES.indexOf(option.max)) {
    throw new AssetError("forbidden", `You can give at most ${option.max} in ${option.name}`);
  }
  return { userId: caller.user!.id, userName: caller.user!.name || caller.user!.email, workspaceId: option.id, scope: input.scope };
}
type Granted = Awaited<ReturnType<typeof granted>>;

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
  const asked = parsed.data.scope?.split(" ").find((s): s is Grantable => (GRANTABLE as readonly string[]).includes(s));
  return { request: parsed.data, client: { name: client.name }, scope: asked ?? "propose", ...(await consentOptions(caller)) };
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

type Device = { clientId: string; secret: string } & ({ status: "pending" } | { status: "denied" } | ({ status: "approved" } & Granted));

/** RFC 8628: the CLI asks for a code, the person approves it on /device, the CLI polls for its key. */
export async function startDevice(clientId: string | null) {
  const client = await clientOf(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id: register first");
  const code = userCode();
  const secret = randomBytes(32).toString("base64url");
  await remember(`oauth-device:${code}`, { clientId: client.id, secret: hashKey(secret), status: "pending" } satisfies Device);
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
  return { client: { name: client?.name ?? "An agent" }, scope: "propose" as Grantable, ...(await consentOptions(caller)) };
}

export async function decideDevice(caller: Caller, typed: string, input: ConsentInput) {
  const row = await pendingDevice(typed);
  const value: Device = input.allow ? { ...row.value, ...(await granted(caller, input)), status: "approved" } : { ...row.value, status: "denied" };
  await db.update(verifications).set({ value: JSON.stringify(value), updatedAt: new Date() }).where(eq(verifications.id, row.id));
  return { allowed: input.allow };
}

// ---- tokens -----------------------------------------------------------------

/** POST /api/v1/oauth/token: a code, or an approved device code, for a key. */
export async function exchange(form: Record<string, string>) {
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
    if (device.status === "pending") throw new OAuthError("authorization_pending", "Waiting for someone to approve the code");
    await db.delete(verifications).where(eq(verifications.id, row.id));
    if (device.status === "denied") throw new OAuthError("access_denied", "The code was turned down");
    return mint(device.clientId, device);
  }
  throw new OAuthError("unsupported_grant_type", `grant_type must be authorization_code or the device code grant`);
}

/** The token is a key: named for the agent and its person, so history and Review say whose it was. */
async function mint(clientId: string, g: Granted) {
  const client = await clientOf(clientId);
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  const name = `${client?.name ?? "An agent"} (${g.userName})`.slice(0, 120);
  const [key] = await db
    .insert(apiKeys)
    .values({ name, scope: g.scope, workspaceId: g.workspaceId, userId: g.userId, prefix: secret.slice(0, 10), hash: hashKey(secret) })
    .returning();
  const [workspace] = (await workspacesOf(g.userId)).workspaces.filter((w) => w.id === g.workspaceId);
  await recordAudit({ actor: g.userName, user: { id: g.userId }, workspace }, "key.created", name, { scope: g.scope, via: "oauth" });
  return { access_token: secret, token_type: "Bearer", scope: key.scope };
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
