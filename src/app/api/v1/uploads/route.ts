import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { createUploadTicket, MAX_UPLOAD_BYTES } from "@/lib/core/assets";

const CreateUpload = z.object({
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/** POST /api/v1/uploads — get a presigned PUT. Bytes never touch this server. */
export async function POST(req: Request) {
  try {
    return ok(await createUploadTicket(await body(req, CreateUpload)));
  } catch (err) {
    return handle(err);
  }
}
