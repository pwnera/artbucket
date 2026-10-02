import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, collectionAssets, collections, shareLinks, type ShareKind } from "@/lib/db/schema";
import { hiddenIn, workspaceById, type Caller } from "@/lib/core/access";
import { createUploadTicket, deliverableSql, finalizeUpload, getAsset, notSuperseded } from "@/lib/core/assets";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit } from "@/lib/core/usage";
import { brandOfWorkspace } from "@/lib/core/branding";
import { appUrlFor } from "@/lib/core/domains";
import { sendAs, shareEmail } from "@/lib/core/mail";
import { getCollection } from "@/lib/core/collections";
import { pagePath, pageSig } from "@/lib/core/signing";
import { publishedSource, viewLook } from "@/lib/core/page-view";
import { AssetError } from "@/lib/core/errors";
import { hasPreview } from "@/lib/preview";
import { NO_OFF, NONE } from "@/lib/access";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { limiter } from "@/lib/rate";
import { isDownloadable } from "@/lib/rights";
import { hashPassword, refusal, shareToken } from "@/lib/share";

/**
 * Share links, for people without an account. A `view` link shows one
 * collection's approved assets, or one asset, with their downloads; an
 * `upload` link takes files into a collection (or the workspace) as
 * proposals, so a photographer or an agency can deliver without an account
 * and nothing they send is final until someone reviews it.
 *
 * Making one needs write on what it shares. Each can expire and carry a
 * password; revoking one stops it at once.
 */

type Link = typeof shareLinks.$inferSelect;

/** On the organization's own domain when it has one. */
const urlOf = async (workspaceId: string, token: string) => {
  const ws = await workspaceById(workspaceId);
  return `${await appUrlFor(ws?.organizationId ?? null)}/s/${token}`;
};

async function targetLabel(link: Pick<Link, "collectionId" | "assetId">) {
  if (link.collectionId) {
    const [c] = await db.select({ name: collections.name }).from(collections).where(eq(collections.id, link.collectionId));
    return { type: "collection" as const, id: link.collectionId, label: c?.name ?? null };
  }
  if (link.assetId) {
    const [a] = await db
      .select({ label: sql<string>`coalesce(${assets.metadata} ->> 'title', ${assets.filename})` })
      .from(assets)
      .where(eq(assets.id, link.assetId));
    return { type: "asset" as const, id: link.assetId, label: a?.label ?? null };
  }
  return { type: "workspace" as const, id: null, label: null };
}

const present = async (link: Link) => ({
  id: link.id,
  kind: link.kind,
  name: link.name,
  target: await targetLabel(link),
  url: await urlOf(link.workspaceId, link.token),
  password: !!link.passwordHash,
  expiresAt: link.expiresAt,
  expired: !!link.expiresAt && link.expiresAt <= new Date(),
  createdBy: link.createdBy,
  createdAt: link.createdAt,
});

/** What making or revoking a link takes: sharing, or collecting into, what it is on. */
async function mayShare(caller: Caller, t: { kind: ShareKind; collectionId: string | null; assetId: string | null }) {
  if (t.collectionId) {
    const c = await getCollection(caller, t.collectionId);
    if (!c) throw new AssetError("not_found", "No such collection");
    return can(caller, t.kind === "upload" ? "collection.collect" : "collection.share", c);
  }
  if (t.assetId) {
    const a = await getAsset(caller, t.assetId);
    if (!a) throw new AssetError("not_found", "No such asset");
    return can(caller, "asset.share", a);
  }
  return can(caller, "share.collect_workspace");
}

export async function createShare(
  caller: Caller,
  input: { kind: ShareKind; collection?: string; asset?: string; name?: string; password?: string; expiresAt?: string; emails?: string[] },
) {
  const t = { kind: input.kind, collectionId: input.collection ?? null, assetId: input.asset ?? null };
  if (input.kind === "view" && !!t.collectionId === !!t.assetId) throw new AssetError("invalid", "A view link shares one collection or one asset");
  if (input.kind === "upload" && t.assetId) throw new AssetError("invalid", "An upload link fills a collection, or the workspace");
  if (!(await mayShare(caller, t))) throw new AssetError("forbidden", "Sharing it takes write on it");
  await checkLimit(caller.workspace.organizationId, "shares");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new AssetError("invalid", "expiresAt is in the past");
  const [row] = await db
    .insert(shareLinks)
    .values({
      workspaceId: caller.workspace.id,
      ...t,
      name: input.name?.trim() || null,
      token: shareToken(),
      passwordHash: input.password ? await hashPassword(input.password) : null,
      expiresAt,
      createdBy: caller.actor,
    })
    .returning();
  const out = await present(row);
  await recordAudit(caller, "share.created", out.target.label ?? caller.workspace.name, {
    kind: row.kind,
    password: out.password,
    expiresAt: row.expiresAt,
  });
  return { ...out, emailed: input.emails?.length ? await mail(caller, row, out, input.emails) : 0 };
}

/** Email a link to people; how many it reached. */
async function mail(caller: Caller, row: Link, out: Awaited<ReturnType<typeof present>>, emails: string[]) {
  let sent = 0;
  for (const to of new Set(emails.map((e) => e.trim().toLowerCase()))) {
    const r = await sendAs(
      caller.workspace.organizationId,
      shareEmail(to, {
        by: caller.actor,
        organization: caller.workspace.organization.name,
        kind: row.kind,
        name: out.name ?? out.target.label ?? caller.workspace.name,
        url: out.url,
        password: out.password,
        expiresAt: row.expiresAt,
      }),
    );
    if (!r.sent && r.error && !sent) throw new AssetError("invalid", `Not sent: ${r.error}`);
    if (r.sent) sent++;
  }
  await recordAudit(caller, "share.sent", out.target.label ?? caller.workspace.name, { kind: row.kind, to: [...new Set(emails)].length, sent });
  return sent;
}

/** Send an existing link to more people. */
export async function sendShare(caller: Caller, id: string, emails: string[]) {
  const [row] = await db.select().from(shareLinks).where(and(eq(shareLinks.id, id), eq(shareLinks.workspaceId, caller.workspace.id)));
  if (!row) return null;
  if (!(await mayShare(caller, row))) throw new AssetError("forbidden", "Sending it takes write on what it shares");
  return { emailed: await mail(caller, row, await present(row), emails) };
}

/** The workspace's links on what the caller may share. */
export async function listShares(caller: Caller) {
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, caller.workspace.id)).orderBy(desc(shareLinks.createdAt));
  const out = [];
  for (const r of rows) if (await mayShare(caller, r).catch(() => false)) out.push(await present(r));
  return out;
}

export async function revokeShare(caller: Caller, id: string) {
  const [link] = await db.select().from(shareLinks).where(and(eq(shareLinks.id, id), eq(shareLinks.workspaceId, caller.workspace.id)));
  if (!link) return false;
  if (!(await mayShare(caller, link))) throw new AssetError("forbidden", "Revoking it takes write on what it shares");
  const gone = await db.delete(shareLinks).where(eq(shareLinks.id, id)).returning({ id: shareLinks.id });
  if (!gone.length) return false;
  await recordAudit(caller, "share.revoked", (await targetLabel(link)).label ?? caller.workspace.name, { kind: link.kind });
  return true;
}

// ---- the other side of the link ---------------------------------------------

/**
 * The link a token names, if it may be used: a 404 for no such link, a 410
 * past its date, a 401 for a missing or wrong password. The 401 says what
 * the link is, so the page can ask for the password by name.
 */
/** Wrong passwords, per link: ten in ten minutes, then it waits, however many addresses guess. */
const guesses = limiter(10, 10 * 60_000);

async function open(token: string, password: string | null) {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
  if (!link) throw new AssetError("not_found", "This link doesn't exist, or was revoked");
  const wait = password ? guesses.wait(link.id) : 0;
  if (wait) throw new AssetError("rate_limited", `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} min`);
  const no = await refusal(link, password);
  if (no === "gone") throw new AssetError("gone", "This link has expired");
  if (no === "password") {
    if (password) guesses.hit(link.id);
    throw new AssetError("password", password ? "That password isn't right" : "This link needs a password", {
      name: link.name,
      kind: link.kind,
      brand: await brandOfWorkspace(link.workspaceId),
    });
  }
  return link;
}

/** Its URLs signed for the holder of the link (lib/core/signing.ts): a day at a time, never past the link. */
const shared = (a: typeof assets.$inferSelect, until: Date | null) => {
  const at = (rest = "") => `${env.APP_URL}${pagePath(a.id, rest, until)}`;
  const m = a.metadata ?? {};
  return {
    id: a.id,
    filename: a.filename,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    url: at(),
    download: at("?download"),
    // False: shown, not handed out (lib/rights.ts isDownloadable). Its download answers 403, its original opens only in the page.
    downloadable: isDownloadable(a),
    thumbnail: hasPreview(a) ? at("/w_640,f_webp") : null,
  };
};

/** What a link shows its holder: what it is, and for a view link the approved assets, a page at a time. */
export async function viewShare(token: string, password: string | null, { limit = 100, offset = 0 } = {}) {
  const link = await open(token, password);
  const ws = await workspaceById(link.workspaceId);
  const target = await targetLabel(link);
  const brand = await brandOfWorkspace(link.workspaceId);
  // The workspace's brand site, once it has been published: the link reads as part of it. Else the organization's accent.
  const src = await publishedSource(link.workspaceId).catch(() => null);
  const look = await viewLook(link.workspaceId, src?.version ? src : null, (id) => pageSig(id, link.expiresAt), brand.accent);
  const meta = {
    kind: link.kind,
    name: link.name,
    workspace: ws?.name ?? null,
    organization: ws?.organization.name ?? null,
    target,
    expiresAt: link.expiresAt,
    // The organization's look, not the product's: a guest sees whose link this is.
    brand,
    look,
  };
  if (link.kind === "upload") return { share: meta, data: [], total: 0 };
  // Only what may be used: approved, unexpired, out of embargo, and a stack's current version.
  // A link to one version serves whichever is current now, so it never hands out the wrong one.
  const where = link.assetId
    ? and(
        deliverableSql,
        notSuperseded,
        sql`(${assets.id} = ${link.assetId} or ${assets.stackId} = (select a.stack_id from ${assets} a where a.id = ${link.assetId}))`,
      )
    : and(
        deliverableSql,
        notSuperseded,
        // An asset only for people added stays theirs, whichever collection it is in.
        eq(assets.private, false),
        sql`exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and ca.collection_id = ${link.collectionId})`,
      );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(where)
      .orderBy(desc(assets.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200))
      .offset(Math.max(offset, 0)),
    db.select({ total: count() }).from(assets).where(where),
  ]);
  return { share: meta, data: rows.map((a) => shared(a, link.expiresAt)), total };
}

/**
 * Whoever holds an upload link: they may propose, into its collection, and
 * nothing else. The grant on the collection is what lets them into a private one.
 */
async function guest(link: Link, ip: string | null): Promise<Caller> {
  const workspace = (await workspaceById(link.workspaceId))!;
  return {
    workspace,
    scope: "propose",
    narrow: link.collectionId ? { ...NONE, collections: { [link.collectionId]: "propose" } } : NONE,
    off: NO_OFF,
    hidden: await hiddenIn(link.workspaceId),
    orgScope: null,
    actor: `${link.name ?? "Upload link"} (guest)`,
    user: null,
    key: null,
    ip,
  };
}

async function uploadLink(token: string, password: string | null) {
  const link = await open(token, password);
  if (link.kind !== "upload") throw new AssetError("forbidden", "This link is for looking, not uploading");
  return link;
}

export async function shareUploadTicket(token: string, password: string | null, input: { filename: string; mime: string; size: number }) {
  const link = await uploadLink(token, password);
  return createUploadTicket({ workspace: (await workspaceById(link.workspaceId))! }, input);
}

/**
 * Promote a guest's upload. It lands `proposed`, filed into the link's
 * collection, for someone in the workspace to review. The guest learns only
 * that it arrived: the library's copy, if the bytes were there already, is
 * none of their business.
 */
export async function shareFinalize(token: string, password: string | null, input: { token: string; filename: string; mime: string }, ip: string | null) {
  const link = await uploadLink(token, password);
  const { deduped } = await finalizeUpload(await guest(link, ip), {
    ...input,
    collections: link.collectionId ? [link.collectionId] : [],
  }).catch((err) => {
    // The same bytes as an asset the guest can't see: it arrived, as far as they are told.
    if (err instanceof AssetError && err.code === "conflict") return { deduped: true };
    throw err;
  });
  return { received: true, deduped };
}
