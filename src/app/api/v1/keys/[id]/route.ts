import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { revokeKey } from "@/lib/core/keys";
import { getConnection, regrant } from "@/lib/core/oauth";
import { Regrant } from "@/lib/schemas";

type P = { id: string };
const isId = (id: string) => z.uuid().safeParse(id).success;

/** GET /api/v1/keys/{id} - an agent you connected: the workspaces it works in, each with its scope, and those you could add. */
export const GET = route<P>(
  "library.read",
  async (_req, { id }, caller) => {
    const c = isId(id) ? await getConnection(caller, id) : null;
    return c && ok({ data: c });
  },
  "No such agent of yours",
);

/**
 * PATCH /api/v1/keys/{id} - an agent you connected, given other workspaces or
 * another scope (`{ workspaces, scope }`, as the consent screen gives them).
 * It keeps its secret: nothing to sign in again.
 */
export const PATCH = route<P>(
  "library.read",
  async (req, { id }, caller) => {
    const c = isId(id)
      ? await regrant(caller, id, await body(req, Regrant))
      : null;
    return c && ok({ data: c });
  },
  "No such agent of yours",
);

/** DELETE /api/v1/keys/{id} - revoke it here: any key for an admin, your own agents' for anyone. It stops working here at once; an agent you connected to other workspaces too keeps those. */
export const DELETE = route<P>(
  "library.read",
  async (_req, { id }, caller) =>
    isId(id) && (await revokeKey(caller, id))
      ? ok({ data: { deleted: true } })
      : null,
  "No such key",
);
