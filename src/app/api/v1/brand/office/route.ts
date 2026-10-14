import { route } from "@/lib/api";
import { officeResponse, releasedOffice } from "@/lib/core/office";
import { OfficeQuery } from "@/lib/schemas";

/**
 * GET /api/v1/brand/office?format=dotx&brand=acme&version=live - the brand's
 * release as a PowerPoint (potx) or Word (dotx) template: its colors as the
 * Office theme, its heading and text families, its logo on the slide master
 * and in the page header (lib/office.ts). `version`: a release's number, else
 * the one readers see.
 */
export const GET = route("brand.read", async (req, _p, caller) => {
  const q = new URL(req.url).searchParams;
  const { format, version } = OfficeQuery.parse(Object.fromEntries(q));
  return officeResponse(req, await releasedOffice(caller.project.id, q.get("brand") ?? undefined, version, format));
});
