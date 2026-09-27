import { body, handle, ok } from "@/lib/api";
import { shareUploadTicket } from "@/lib/core/shares";
import { CreateUpload } from "@/lib/schemas";

/** POST /api/v1/shared/{token}/uploads - an upload link's presigned PUT, like /api/v1/uploads. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const input = await body(req, CreateUpload);
    return ok(await shareUploadTicket((await params).token, req.headers.get("x-share-password"), input));
  } catch (err) {
    return handle(err);
  }
}
