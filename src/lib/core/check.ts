import type { Caller } from "@/lib/core/access";
import { currentVersion, getAsset, type Asset } from "@/lib/core/assets";
import { listRules } from "@/lib/core/brand";
import { AssetError } from "@/lib/core/errors";
import { record, who } from "@/lib/core/events";
import { env } from "@/lib/env";
import type { Surface } from "@/lib/insights";
import { rightsReasons, today, type Reason, type Use } from "@/lib/rights";

/**
 * May this asset be used like this? One answer, with reasons, and what to use
 * instead where there is something: the question a DAM usually leaves to a
 * person reading a PDF. It weighs, in order:
 *
 * - lifecycle: only approved assets are the library's; archived ones are retired
 * - replacement: a superseded asset names what replaced it
 * - rights: license window, territory, channel, model release (lib/rights.ts)
 * - the brand: in a context with its own variant of a rule (logo on a dark
 *   background), the default's assets are the wrong ones
 *
 * Every answer is recorded for Insights' use-check log (lib/core/events.ts):
 * the verdict, the blocking reasons and what was offered instead.
 */

export type Check = Use & { asset: string; context?: string; brand?: string };

type Suggestion = { id: string; title: string; url: string; why: string };

const title = (a: Pick<Asset, "filename" | "metadata">) => a.metadata?.title ?? a.filename;
const url = (id: string, rendition?: string | null) => `${env.APP_URL}/a/${id}${rendition ? `/${rendition}` : ""}`;

export async function checkUse(caller: Caller, { asset: id, context, brand, ...use }: Check, surface: Surface = caller.key ? "api" : "app") {
  const ws = caller.workspace.id;
  const asset = await getAsset(caller, id);
  if (!asset) throw new AssetError("not_found", `No asset ${id}`);
  const date = use.date ?? today();
  const reasons: Reason[] = [];
  const suggest: Suggestion[] = [];

  if (asset.deletedAt) {
    reasons.push({ code: "deleted", blocking: true, message: "Deleted: it is on its way out of the library" });
  } else if (asset.status === "archived") {
    reasons.push({ code: "archived", blocking: true, message: "Archived: retired from use" });
  } else if (asset.status !== "active") {
    reasons.push({
      code: "not_approved",
      blocking: true,
      message:
        asset.status === "proposed"
          ? "Proposed, not approved: it waits for a person's review"
          : asset.status === "draft"
            ? "A draft: not yet submitted or approved"
            : `Rejected in review${asset.reviewNote ? `: ${asset.reviewNote}` : ""}`,
    });
  }

  // What is offered instead must pass for this use itself: a replacement whose license ran out is no way out.
  const barred = (a: Asset | null) =>
    !a || a.deletedAt ? "it is gone" : a.status !== "active" ? "it isn't approved" : rightsReasons(a.rights, { ...use, date }).find((r) => r.blocking)?.message ?? null;

  if (asset.supersededBy) {
    const current = await currentVersion(asset);
    const no = current.id !== asset.id ? barred(current) : null;
    reasons.push({ code: "superseded", blocking: true, message: `Replaced by ${title(current)}${no ? `, which can't be used here either: ${no}` : ""}` });
    if (current.id !== asset.id && !no) suggest.push({ id: current.id, title: title(current), url: url(current.id), why: "Its replacement" });
  }

  reasons.push(...rightsReasons(asset.rights, { ...use, date }));

  if (context) {
    // Rules whose default points at this asset, and the variant they have for this context.
    const pointing = (await listRules(ws, { asset: id, brand })).filter((r) => r.context === null);
    const variants = new Map<string, Awaited<ReturnType<typeof listRules>>>();
    for (const r of pointing) {
      const b = r.brand!;
      if (!variants.has(b)) variants.set(b, await listRules(ws, { brand: b, context }));
      const variant = variants.get(b)!.find((v) => v.key === r.key);
      if (!variant || variant.context !== context || variant.assets.some((a) => a.id === id)) continue;
      const names = variant.assets.map((a) => a.title ?? a.filename).join(", ");
      reasons.push({
        code: "context",
        blocking: true,
        message: `${r.key} has its own ${context} version${names ? `: ${names}` : ""}${r.brand && brand === undefined ? ` (${r.brand})` : ""}`,
      });
      for (const a of variant.assets) {
        if (suggest.some((s) => s.id === a.id) || barred(await getAsset(caller, a.id))) continue;
        suggest.push({ id: a.id, title: a.title ?? a.filename!, url: url(a.id, a.rendition), why: `${r.key} for ${context}` });
      }
    }
  }

  const allowed = !reasons.some((r) => r.blocking);
  record({
    workspaceId: ws,
    kind: "check",
    surface,
    ...who(caller),
    assetId: asset.id,
    version: asset.version,
    subject: context ?? null,
    verdict: allowed ? "allowed" : "refused",
    reasons: reasons.filter((r) => r.blocking).map((r) => r.code),
    offered: suggest.map((s) => s.id),
  });
  return {
    allowed,
    asset: { id: asset.id, title: title(asset), url: url(asset.id) },
    use: { ...use, date, ...(context ? { context } : {}) },
    reasons,
    suggest,
  };
}
