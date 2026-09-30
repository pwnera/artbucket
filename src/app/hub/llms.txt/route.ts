import { hubListings } from "@/lib/core/hub";
import { env } from "@/lib/env";

/** The hub as llms.txt (llmstxt.org): how an agent finds a brand here, and what is listed. */
export async function GET() {
  const hub = env.HUB_URL!;
  const cards = await hubListings({ limit: 200 });
  const text = [
    "# Artbucket BrandHub",
    "",
    "> Brand rules (colors, type, logos, voice) that projects, organizations and companies share. Public: no key, no sign in.",
    "",
    `- Search: ${hub}/index.json?q={words}`,
    `- A brand: ${hub}/{org}/{brand}/llms.txt, /brand.json (AdCP brand.json), /rules.json (every rule), /tokens?format=css`,
    `- Pin a version: ${hub}/{org}/{brand}@{n}/brand.json`,
    "- A listing without a verified domain or GitHub account is a community one: it may not come from the brand's owner.",
    "",
    "## Brands",
    "",
    ...cards.map((c) => `- [${c.name}](${hub}${c.path}/llms.txt): ${c.org}/${c.brand}, release @${c.version}, ${c.verified ? `verified ${c.verified}` : "community"}`),
  ].join("\n");
  return new Response(text + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=300", "Access-Control-Allow-Origin": "*" } });
}
