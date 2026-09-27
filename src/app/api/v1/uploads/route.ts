import { body, ok, route } from "@/lib/api";
import { createUploadTicket } from "@/lib/core/assets";
import { CreateUpload } from "@/lib/schemas";

/** POST /api/v1/uploads - get a presigned PUT. Bytes never touch this server. */
export const POST = route("asset.upload", async (req, _p, caller) => ok(await createUploadTicket(caller, await body(req, CreateUpload))));
