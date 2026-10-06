import { body, handle, ok } from "@/lib/api";
import { ipOf } from "@/lib/client-ip";
import { reportListing } from "@/lib/core/hub-trust";
import { HubReportInput } from "@/lib/schemas";

/**
 * POST /api/v1/hub/{org}/{brand}/reports - tell a public listing's owner and
 * this server's operator what is wrong with it. Anyone, no key; the address
 * only counts toward a limit, and is never kept.
 */
export async function POST(req: Request, { params }: { params: Promise<{ org: string; brand: string }> }) {
  try {
    const { org, brand } = await params;
    const input = await body(req, HubReportInput);
    const ip = ipOf(req.headers);
    return ok({ data: await reportListing(org, brand, input, ip) }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
