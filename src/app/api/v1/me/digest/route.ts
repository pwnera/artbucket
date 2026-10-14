import { body, ok, route } from "@/lib/api";
import { myDigest, setMyDigest } from "@/lib/core/digest";
import { DigestSetting } from "@/lib/schemas";

/** GET /api/v1/me/digest - whether you get the weekly digest. A person signed in. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await myDigest(caller) }));

/** PATCH /api/v1/me/digest - turn it on or off. */
export const PATCH = route(null, async (req, _p, caller) => ok({ data: await setMyDigest(caller, (await body(req, DigestSetting)).weekly) }));
