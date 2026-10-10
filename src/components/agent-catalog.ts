import {
  IconApi,
  IconBrandAdobe,
  IconBrandFigma,
  IconBrandGoogle,
  IconBrandOpenai,
  IconBrandVercel,
  IconBrandVscode,
  IconBrandZapier,
  IconCode,
  IconHeart,
  IconMessageCircle,
  IconPalette,
  IconPlugConnected,
  IconRoute,
  IconSearch,
  IconSparkles,
  IconTerminal2,
  IconTypography,
  IconVectorBezier2,
  type Icon,
} from "@/components/icons";

/**
 * Every agent the Connections page knows, as data: supporting one is an entry
 * here, not a component. They all reach the same MCP server; what differs is
 * how you tell each one where it is.
 *
 * `auth`:
 *   oauth  paste the URL; it sends you here to sign in and pick what it may do
 *   key    it can't do OAuth: give it a key an admin makes
 *   via    it has an MCP server of its own, not a client, so it can't call
 *          artbucket: connect both to the same agent, which carries files
 *          between them
 *   skill  no MCP: the skill teaches it the CLI
 */

export const GROUPS = ["Chat apps", "Coding agents", "App builders", "Design tools", "Generators", "Automations", "Other"] as const;
export type Group = (typeof GROUPS)[number];
export type Auth = "oauth" | "key" | "via" | "skill";

/** What a setup is written with: the server, and the key just made (automations only). */
export type Setup = { origin: string; mcp: string; key: string };

/** A setup, one part at a time: a sentence, something to copy, or a one-click install. */
export type Part = string | { copy: string; what: string; multiline?: boolean; prose?: boolean } | { href: string; label: string };

/**
 * `logo`: a file in public/logos/agents (Simple Icons, in its brand color); without one, `icon` stands in.
 * `key`: it signs in with OAuth, or takes a key: the setup offers to make one.
 */
export type Agent = { name: string; icon: Icon; logo?: string; group: Group; auth: Auth; key?: boolean; blurb: string; snippet: (s: Setup) => Part[] };

/** The GitHub repository: the skill and the Claude Code plugin install from it. */
export const REPO = "pwnera/artbucket";

const SIGN_IN = "It sends you here to sign in and pick what it may do. It shows up in Connected once it makes its first call.";

/** The common case: somewhere in its settings, a custom MCP server with a URL. */
const pasteUrl = (where: string) => (s: Setup): Part[] => [where, { copy: s.mcp, what: "the URL" }, SIGN_IN];

const skill: Agent["snippet"] = (s) => [
  "No MCP here, so the skill teaches it the artbucket CLI. Install the skill:",
  { copy: `npx skills add ${REPO}`, what: "the command" },
  "Then sign the CLI in, from a clone of artbucket (it opens this server to approve a code):",
  { copy: `ARTBUCKET_URL=${s.origin} pnpm artbucket login`, what: "the command" },
];

/** A generator artbucket reaches through an agent: brand in, file out, filed with its provenance. */
const via = (tool: string, ask: string): Agent["snippet"] => () => [
  `${tool} has an MCP server of its own, so it can't call artbucket. Connect both to the same agent (Claude, ChatGPT) and ask it:`,
  {
    copy: `Read our brand rules from artbucket, then ${ask} with ${tool} in our palette and type. Add the result to artbucket as generated, with ${tool} as the generator and your prompt, and run check_use before we use it.`,
    what: "the prompt",
    prose: true,
  },
  "What it makes lands in Review with its generator and prompt, for a person to approve.",
];

const header = (s: Setup) => `Authorization: Bearer ${s.key}`;

export const AGENTS: Agent[] = [
  // Chat apps: a URL and a consent screen.
  {
    name: "Claude",
    icon: IconMessageCircle,
    logo: "/logos/agents/claude.svg",
    group: "Chat apps",
    auth: "oauth",
    blurb: "Claude.ai, Desktop and Cowork",
    snippet: pasteUrl("Settings, Connectors, Add custom connector. Paste:"),
  },
  {
    name: "ChatGPT",
    icon: IconBrandOpenai,
    group: "Chat apps",
    auth: "oauth",
    blurb: "Generate with GPT Image, file it here",
    snippet: (s) => [
      "Settings, Apps & Connectors, Advanced settings: turn on Developer mode. Then Create, with OAuth and this URL:",
      { copy: s.mcp, what: "the URL" },
      SIGN_IN,
      { copy: "Make a launch banner in our brand colors, then add it to artbucket as generated, with your prompt.", what: "the prompt", prose: true },
    ],
  },
  { name: "Perplexity", icon: IconSearch, logo: "/logos/agents/perplexity.svg", group: "Chat apps", auth: "oauth", blurb: "Research with the brand at hand", snippet: pasteUrl("Settings, Connectors, add a custom connector. Paste:") },
  {
    name: "Gemini",
    icon: IconBrandGoogle,
    logo: "/logos/agents/googlegemini.svg",
    group: "Chat apps",
    auth: "oauth",
    blurb: "Generate with Nano Banana, file it here",
    snippet: pasteUrl("Add a custom MCP connector (Gemini Spark). Paste:"),
  },

  // Coding agents: a command or a one-click install.
  {
    name: "Claude Code",
    icon: IconTerminal2,
    logo: "/logos/agents/claude.svg",
    group: "Coding agents",
    auth: "oauth",
    blurb: "One command, or the plugin with the skill",
    snippet: (s) => [
      { copy: `claude mcp add --transport http artbucket ${s.mcp}`, what: "the command" },
      "Then /mcp in Claude Code to sign in. Or install the plugin, which brings the skill too:",
      { copy: `/plugin marketplace add ${REPO}\n/plugin install artbucket@artbucket`, what: "the commands", multiline: true },
      `The plugin connects to ARTBUCKET_URL, or localhost:3000 when it's unset.`,
    ],
  },
  {
    name: "Cursor",
    icon: IconCode,
    logo: "/logos/agents/cursor.svg",
    group: "Coding agents",
    auth: "oauth",
    blurb: "One click",
    snippet: (s) => [
      { href: `cursor://anysphere.cursor-deeplink/mcp/install?name=artbucket&config=${btoa(JSON.stringify({ url: s.mcp }))}`, label: "Add to Cursor" },
      "Or in .cursor/mcp.json:",
      { copy: JSON.stringify({ mcpServers: { artbucket: { url: s.mcp } } }, null, 2), what: "the config", multiline: true },
      SIGN_IN,
    ],
  },
  {
    name: "VS Code",
    icon: IconBrandVscode,
    group: "Coding agents",
    auth: "oauth",
    blurb: "Copilot agent mode, one click",
    snippet: (s) => [
      { href: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "artbucket", type: "http", url: s.mcp }))}`, label: "Install in VS Code" },
      "Or from a terminal:",
      { copy: `code --add-mcp '${JSON.stringify({ name: "artbucket", type: "http", url: s.mcp })}'`, what: "the command" },
      SIGN_IN,
    ],
  },
  { name: "Codex", icon: IconBrandOpenai, group: "Coding agents", auth: "skill", blurb: "Through the skill and the CLI", snippet: skill },
  { name: "OpenClaw", icon: IconTerminal2, group: "Coding agents", auth: "skill", blurb: "Through the skill and the CLI", snippet: skill },
  { name: "Hermes", icon: IconTerminal2, group: "Coding agents", auth: "skill", blurb: "Through the skill and the CLI", snippet: skill },

  // App builders: your vibe-coded app, on-brand.
  { name: "Lovable", icon: IconHeart, group: "App builders", auth: "oauth", blurb: "Apps built on the real brand", snippet: pasteUrl("In its integrations, add a custom MCP server. Paste:") },
  { name: "v0", icon: IconBrandVercel, logo: "/logos/agents/v0.svg", group: "App builders", auth: "oauth", blurb: "Apps built on the real brand", snippet: pasteUrl("In its MCP connections, add a custom one. Paste:") },
  { name: "Bolt", icon: IconPlugConnected, group: "App builders", auth: "oauth", blurb: "Apps built on the real brand", snippet: pasteUrl("In its connectors, add a custom MCP server. Paste:") },
  { name: "Replit", icon: IconCode, logo: "/logos/agents/replit.svg", group: "App builders", auth: "oauth", blurb: "Apps built on the real brand", snippet: pasteUrl("In Agent's integrations, add an MCP server. Paste:") },

  // Design tools
  {
    name: "Figma",
    icon: IconBrandFigma,
    logo: "/logos/agents/figma.svg",
    group: "Design tools",
    auth: "oauth",
    blurb: "Figma Make and the Figma agent",
    snippet: pasteUrl("Add a custom MCP connector in Figma Make or the Figma agent. Designs start from the real logo, palette and type scale. Paste:"),
  },

  // Generators: through the agent, not a connect button.
  { name: "Canva", icon: IconPalette, group: "Generators", auth: "via", blurb: "Use with Claude or ChatGPT", snippet: via("Canva", "make an Instagram story for the autumn launch") },
  { name: "Adobe", icon: IconBrandAdobe, group: "Generators", auth: "via", blurb: "Firefly, Photoshop, Express", snippet: via("Adobe Firefly", "make a background for our product shots") },
  { name: "Recraft", icon: IconVectorBezier2, group: "Generators", auth: "via", blurb: "Native SVG", snippet: via("Recraft", "make a set of four line icons as SVG") },
  { name: "Ideogram", icon: IconTypography, group: "Generators", auth: "via", blurb: "Text in images", snippet: via("Ideogram", "make a poster with the headline \"Autumn drop\"") },
  { name: "Krea", icon: IconSparkles, group: "Generators", auth: "via", blurb: "Flux, Kling, Ideogram and more", snippet: via("Krea", "make a moodboard of four images with Flux") },

  // Automations: headless, so a key.
  {
    name: "n8n",
    icon: IconRoute,
    logo: "/logos/agents/n8n.svg",
    group: "Automations",
    auth: "key",
    blurb: "MCP Client Tool node",
    snippet: (s) => ["In an MCP Client Tool node: HTTP Streamable, this endpoint, and Bearer auth with the key.", { copy: s.mcp, what: "the endpoint" }, { copy: s.key, what: "the key" }],
  },
  {
    name: "Make",
    icon: IconRoute,
    logo: "/logos/agents/make.svg",
    group: "Automations",
    auth: "key",
    blurb: "MCP client module",
    snippet: (s) => ["In an MCP client module, this URL, with the key as a bearer token.", { copy: s.mcp, what: "the URL" }, { copy: header(s), what: "the header" }],
  },
  {
    name: "Zapier",
    icon: IconBrandZapier,
    group: "Automations",
    auth: "key",
    blurb: "Webhooks and the OpenAPI spec",
    snippet: (s) => [
      "Webhooks by Zapier, against the REST API, with the key as a header. Every endpoint is in the OpenAPI spec:",
      { copy: `${s.origin}/api/v1/openapi.json`, what: "the spec URL" },
      { copy: header(s), what: "the header" },
    ],
  },

  // Anything else
  {
    name: "Any MCP client",
    icon: IconPlugConnected,
    logo: "/logos/agents/modelcontextprotocol.svg",
    group: "Other",
    auth: "oauth",
    key: true,
    blurb: "Streamable HTTP, OAuth or a key",
    snippet: (s) => [
      "Streamable HTTP at this URL. With OAuth it finds its way to sign in on its own; without, send a key as a bearer token.",
      { copy: s.mcp, what: "the URL" },
      { copy: header(s), what: "the header" },
    ],
  },
  {
    name: "REST and CLI",
    icon: IconApi,
    group: "Other",
    auth: "key",
    blurb: "curl, scripts, the artbucket CLI",
    snippet: (s) => [
      { copy: `curl -H '${header(s)}' '${s.origin}/api/v1/assets?q=logo'`, what: "the command" },
      "The CLI signs in without a key:",
      { copy: `ARTBUCKET_URL=${s.origin} pnpm artbucket login`, what: "the command" },
      { copy: `${s.origin}/api/v1/openapi.json`, what: "the spec URL" },
    ],
  },
];
