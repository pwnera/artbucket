import { fail, handle, ok } from "@/lib/api";
import { unsubscribe } from "@/lib/core/digest";

type Ctx = { params: Promise<{ token: string }> };

/** POST /api/v1/unsubscribe/{token} - the weekly digest's own link: turns it off. Public: the token is the secret. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    return (await unsubscribe((await params).token)) ? ok({ data: { weekly: false } }) : fail(404, "not_found", "This unsubscribe link isn't one of ours");
  } catch (err) {
    return handle(err);
  }
}
