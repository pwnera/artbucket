import { route } from "@/lib/api";
import { printPage, WIDTHS } from "@/lib/core/print";

type P = { slug: string; page: string };

/**
 * GET /api/v1/brands/{slug}/pages/{page}/preview?width=desktop|phone&context= -
 * the draft page as readers see it, drawn by the server's browser, as a JPEG.
 * What preview_page hands an agent, for a person or a script.
 */
export const GET = route<P>("brand.read", async (req, { slug, page }, caller) => {
  const q = new URL(req.url).searchParams;
  const width = q.get("width");
  const { jpeg, height } = await printPage(caller, slug, page, {
    width: width && width in WIDTHS ? (width as keyof typeof WIDTHS) : "desktop",
    context: q.get("context") || undefined,
  });
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "X-Height": String(height), "Cache-Control": "private, no-store" },
  });
});
