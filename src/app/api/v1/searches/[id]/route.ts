import { z } from "zod";
import { ok, route } from "@/lib/api";
import { deleteSearch } from "@/lib/core/searches";

/** DELETE /api/v1/searches/{id} */
export const DELETE = route<{ id: string }>("write", async (_req, { id }) =>
  z.uuid().safeParse(id).success && (await deleteSearch(id)) ? ok({ data: { deleted: true } }) : null,
"No such saved search");
