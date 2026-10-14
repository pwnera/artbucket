import { body, ok, route } from "@/lib/api";
import { cutPdf } from "@/lib/core/pdf-cut";
import { PdfCut } from "@/lib/schemas";

/**
 * POST /api/v1/assets/{id}/cut - an area of a PDF's page as an asset of its
 * own: `{ page, box: [left, top, right, bottom] }`, the box in fractions of
 * the page. What is drawn there as vectors comes out as an SVG (a logo in a
 * brand book), anything else as a PNG. The new asset's parent is the PDF.
 */
export const POST = route<{ id: string }>(
  "asset.upload",
  async (req, { id }, caller) => {
    const made = await cutPdf(caller, id, await body(req, PdfCut));
    return made && ok({ data: made.asset, deduped: made.deduped }, { status: made.deduped ? 200 : 201 });
  },
  "No such asset",
);
