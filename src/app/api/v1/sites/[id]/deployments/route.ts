import { z } from "zod";
import { ok, route, zipBody } from "@/lib/api";
import { deploy, listDeployments } from "@/lib/core/sites";

/** GET /api/v1/sites/{id}/deployments - its deployments, newest first: where each is mounted, its state, and why one failed. */
export const GET = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const data = z.uuid().safeParse(id).success && (await listDeployments(caller, id));
  return data ? ok({ data }) : null;
}, "No such site");

/**
 * POST /api/v1/sites/{id}/deployments?path=/docs&kind=docs&commit=&ref=&preview= -
 * the body is a zip of static files (a built site, index.html at its root or
 * in the one folder it wraps). Checked, stored, then live at `path`; the
 * deployment live there before stays, replaced, to restore. With `preview`
 * (pr-12), it is that preview instead, at its own address, never live.
 */
export const POST = route<{ id: string }>("portal.manage", async (req, { id }, caller) => {
  if (!z.uuid().safeParse(id).success) return null;
  const q = new URL(req.url).searchParams;
  const zip = await zipBody(req);
  const data = await deploy(caller, id, zip, { path: q.get("path"), kind: q.get("kind"), commit: q.get("commit"), ref: q.get("ref"), preview: q.get("preview") });
  return data ? ok({ data }, { status: 201 }) : null;
}, "No such site");
