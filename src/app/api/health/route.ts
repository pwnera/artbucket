import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * GET /api/health - 200 `{ ok: true }` when the server answers and reaches
 * its database within a second, else 503: for a load balancer's readiness
 * check or a smoke test after a deploy. Outside v1, unversioned, with no
 * caller: it says nothing about what the server holds.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The database took longer than a second")), 1000);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), late]);
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (err) {
    console.error("health check failed", (err as Error).message);
    return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  } finally {
    clearTimeout(timer);
  }
}
