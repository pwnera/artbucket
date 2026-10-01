import { ok, route } from "@/lib/api";
import { acceptJoin, refuseJoin } from "@/lib/core/email-domains";

/** POST /api/v1/join - join the organization at your email's domain (me.joinable), able to read. */
export const POST = route(null, async (_req, _p, caller) => {
  const offer = await acceptJoin(caller);
  return offer ? ok({ data: offer }) : null;
}, "Nothing to join at your email's domain");

/** DELETE /api/v1/join - not now: the offer isn't made again. */
export const DELETE = route(null, async (_req, _p, caller) => {
  const offer = await refuseJoin(caller);
  return offer ? ok({ data: offer }) : null;
}, "Nothing to join at your email's domain");
