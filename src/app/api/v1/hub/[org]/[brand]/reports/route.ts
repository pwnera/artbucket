import { body, handle, ok } from "@/lib/api";
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
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    return ok({ data: await reportListing(org, brand, input, ip) }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handle(err);
  }
}
