import { ok, route } from "@/lib/api";
import { lineage } from "@/lib/core/catalog";

/** GET /api/v1/catalog/{id or address}/lineage?direction=up,down&depth=3 - what it comes from and what uses it. */
export const GET = route<{ ref: string }>("catalog.read", async (req, { ref }, caller) => {
  const params = new URL(req.url).searchParams;
  const direction = (params.get("direction") ?? "up,down").split(",").filter((d): d is "up" | "down" => d === "up" || d === "down");
  const found = await lineage(caller, decodeURIComponent(ref), { depth: Number(params.get("depth")) || 3, direction });
  return found && ok(found);
});
