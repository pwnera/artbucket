import { getAsset, ingestBytes } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import type { Caller } from "@/lib/core/access";
import { CutError, cutPage, type Box } from "@/lib/pdf-cut";
import { getObject, originalKey } from "@/lib/storage";

/**
 * Part of a PDF's page as an asset of its own: a logo drawn in a brand book, cut out by lib/pdf-cut.ts (an SVG of its
 * vectors, or a PNG). The cut is a new asset whose parent is the PDF.
 */

export type CutInput = {
  page: number;
  box: Box;
  filename?: string;
  collections?: string[];
  tags?: string[];
};

/** Cuts an area of a PDF asset's page into a new asset (an SVG, or a PNG for what isn't vectors), its child. */
export async function cutPdf(caller: Caller, id: string, input: CutInput) {
  const pdf = await getAsset(caller, id);
  if (!pdf) return null;
  if (pdf.mime !== "application/pdf" && pdf.mime !== "application/postscript" && pdf.mime !== "application/illustrator") {
    throw new AssetError("unsupported", "Only a PDF (or a PDF-compatible Illustrator file) can be cut");
  }
  const cut = await cutPage(await getObject(originalKey(pdf.sha256)), input.page, input.box).catch((err: unknown) => {
    if (err instanceof CutError) throw new AssetError(err.code === "failed" ? "unavailable" : "invalid", err.message);
    throw err;
  });
  const base = (input.filename ?? `${pdf.filename.replace(/\.[^.]+$/, "")} p${input.page}`).replace(/\.(svg|png)$/i, "");
  return ingestBytes(caller, {
    bytes: cut.bytes,
    mime: cut.svg ? "image/svg+xml" : "image/png",
    filename: `${base}.${cut.svg ? "svg" : "png"}`,
    parentAssetId: pdf.id,
    ...(input.collections?.length && { collections: input.collections }),
    ...(input.tags?.length && { tags: input.tags }),
  });
}
