import { hubListings } from "@/lib/core/hub";
import { env } from "@/lib/env";

/** GET /index.json?q=: what the hub lists, newest publish first, or what a search finds. For agents, public and keyless. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  const cards = await hubListings({ q, limit: 200 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const data = cards.map(({ id: _id, logo: _logo, path, ...c }) => ({ ...c, url: env.HUB_URL + path }));
  return Response.json({ data }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300", "Access-Control-Allow-Origin": "*" } });
}
