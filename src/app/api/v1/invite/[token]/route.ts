import { authorize, fail, handle, ok } from "@/lib/api";
import { acceptInvitation, describeInvitation } from "@/lib/core/people";

type Ctx = { params: Promise<{ token: string }> };
const gone = () => fail(404, "not_found", "This invitation doesn't exist, was used, or has expired");

/** GET /api/v1/invite/{token} - what the invitation offers. Public: the token is the secret. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const info = await describeInvitation((await params).token);
    return info ? ok({ data: info }) : gone();
  } catch (err) {
    return handle(err);
  }
}

/** POST /api/v1/invite/{token} - take it, as the signed-in person. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const caller = await authorize(req, null);
    if (caller instanceof Response) return caller;
    if (!caller.user) return fail(401, "unauthorized", "Sign in, or make an account, to accept");
    const done = await acceptInvitation((await params).token, { ...caller.user, ip: caller.ip });
    return done ? ok({ data: done }) : gone();
  } catch (err) {
    return handle(err);
  }
}
