import { ok, route } from "@/lib/api";
import { acceptOffer, refuseOffer } from "@/lib/core/hub-claims";
import { HubOfferAccept } from "@/lib/schemas";

type P = { org: string; brand: string };

/** POST /api/v1/hub/offers/{org}/{brand} - make the listing yours: a brand of your own from it, public; it leaves BrandHub for yours. The body may be left out. */
export const POST = route<P>("organization.manage", async (req, { org, brand }, caller) => {
  const raw = await req.text();
  return ok({ data: await acceptOffer(caller, org, brand, HubOfferAccept.parse(raw ? JSON.parse(raw) : {})) }, { status: 201 });
});

/** DELETE /api/v1/hub/offers/{org}/{brand} - it isn't your brand: offered no more. */
export const DELETE = route<P>("organization.manage", async (_req, { org, brand }, caller) => ok({ data: await refuseOffer(caller, org, brand) }));
