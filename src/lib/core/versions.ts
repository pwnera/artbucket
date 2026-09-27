import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { record } from "@/lib/core/activity";
import { columns, getAsset, visible, type Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { STATE_LABEL } from "@/lib/lifecycle";
import { can, needs } from "@/lib/permissions";

/**
 * Version stacks: a new file for the same thing (the logo, redrawn) joins its
 * stack instead of standing beside it (finalizeUpload's `versionOf`). One
 * approved version is current: the library shows it, share links serve it,
 * and every other approved version is superseded by it, so /api/v1/check
 * refuses them and names it. Rolling back is making an older one current.
 */

/** Every version the caller can see, newest first; an asset with one version is a stack of one. */
export async function listVersions(caller: Caller, id: string): Promise<Asset[] | null> {
  const asset = await getAsset(caller, id);
  if (!asset?.stackId) return asset && [asset];
  return db
    .select(columns)
    .from(assets)
    .where(and(eq(assets.stackId, asset.stackId), visible(caller)))
    .orderBy(desc(assets.version));
}

/** Roll back, or forward: make version `number` of this asset's stack the current one. */
export async function makeCurrent(caller: Caller, id: string, number: number): Promise<Asset[] | null> {
  const versions = await listVersions(caller, id);
  if (!versions) return null;
  const v = versions.find((x) => x.version === number);
  if (!v) throw new AssetError("not_found", `No version ${number}`);
  if (!can(caller, "asset.review", v)) throw new AssetError("forbidden", `You need ${needs("asset.review")}`);
  if (v.state !== "active") {
    throw new AssetError("invalid", `Version ${number} is ${STATE_LABEL[v.state].toLowerCase()}: only an approved, unexpired version can be current`);
  }
  if (!v.current) {
    await repoint(v.stackId!, { id: v.id, force: true });
    await record(caller, "made_current", v, { version: number });
  }
  return listVersions(caller, id);
}

/**
 * Point the stack at its current version and supersede every other approved
 * one by it. The current one stays current while it is approved; `prefer`
 * takes over when it is approved and newer, or always with `force` (a
 * rollback). With no approved version left, nothing is current.
 */
export async function repoint(stack: string, prefer?: { id: string; force?: boolean }) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: assets.id, version: assets.version, status: assets.status, current: assets.current })
      .from(assets)
      .where(eq(assets.stackId, stack))
      .for("update");
    const live = rows.filter((r) => r.status === "active").sort((a, b) => b.version! - a.version!);
    const now = live.find((r) => r.current);
    const want = prefer && live.find((r) => r.id === prefer.id);
    const to = (want && (prefer!.force || !now || want.version! > now.version!) ? want : now) ?? live[0];
    const id = to?.id ?? null;
    // Two statements: the one-current index is checked row by row, so the old current goes first.
    await tx
      .update(assets)
      .set({ current: false })
      .where(and(eq(assets.stackId, stack), eq(assets.current, true), id ? sql`${assets.id} <> ${id}` : undefined));
    await tx
      .update(assets)
      .set({
        current: sql`coalesce(${assets.id} = ${id}::uuid, false)`,
        // Replacements inside the stack are the stack's to set; one pointing elsewhere is a person's, and stays.
        supersededBy: sql`case
          when ${assets.id} <> ${id}::uuid and ${assets.status} = 'active' then ${id}::uuid
          when ${assets.supersededBy} in (select s.id from ${assets} s where s.stack_id = ${stack}) then null
          else ${assets.supersededBy} end`,
        updatedAt: sql`now()`,
      })
      .where(eq(assets.stackId, stack));
  });
}
