import preview from "#.storybook/preview";
import { NOW, me, viewer, withMe } from "#.storybook/fixtures/brands";
import { renditions } from "#.storybook/fixtures/library";
import { expect, fn, spyOn, within } from "storybook/test";
import { AnswerLine, AssistantAnswer } from "@/components/assistant-answer";

// Ids as the server's assistant writes them: UUIDs (lib/assistant-answer.ts checks each).
const LOGO = "6700995f-e0d8-4e6b-a64f-7abbf7ec1752";
const DARK = "b778186c-9853-4a68-b8d2-ffce37d8a6da";
const HERO = "0c8f2d4e-3a51-4b7e-9f10-2d6c8e4a9b31";
const PRESS = "5e2a7c90-1b4d-4f3e-8a6c-7d9e0f1a2b3c";

/** An answer with every block the panel draws: chips, swatches, a verdict, a grid, a table, a note, a typeface, facts, code, a place, an approval and questions to tap. */
const ANSWER = `### The Acme logo
Use [[asset:${LOGO}|acme-logo.svg]] on light grounds, in [[color:#2f62ff|Acme Blue]] or [[color:#0b1020|Ink]]. [[person:usr_ada|Ada Lovelace]] approved it for [[brand:acme|Acme]], and it is in [[collection:${PRESS}|Press kit]].

[[verdict:conditions|Web and social only, [[date:2026-12-31|until]].]]

[[assets:${LOGO}|acme-logo.svg;${DARK}|acme-logo-dark.svg;${HERO}|hero-spring.jpg]]

| Asset | Rights |
|---|---|
| acme-logo.svg | **Owned** |
| hero-spring.jpg | Licensed [[date:2026-11-01|until]] |

> ⚠ The 2019 logo was replaced: never use it.

[[font:Inter|Headings|]]

[[facts:Release|12;Rules|9;Updated|[[date:2026-10-13|since]]]]

1. Read the rules first.
2. Ask \`check_use\` before you hand it out.

\`\`\`js
fetch("/c/${LOGO}/w_800,f_webp")
\`\`\`

See [[open:brand/acme/rules|Acme's rules]] or [the docs](https://docs.artbucket.test).

[[action:act_logo]]

[[next:Which logo for dark grounds?;Who approved the hero?]]`;

const meta = preview.meta({
  title: "App/Features/Assistant answer",
  component: AssistantAnswer,
  args: {
    text: ANSWER,
    streaming: false,
    card: (id: string) => <div className="rounded-lg border border-dashed p-3 text-xs">The approval card for {id} (the panel draws it)</div>,
    onGo: fn(),
    onAsk: fn(),
  },
  decorators: [withMe(me), (Story) => <div className="max-w-md">{Story()}</div>],
  beforeEach: ({ msw }) => {
    // Thumbnails and the typeface come from /a/, drawn here.
    msw.use(...renditions);
    // "Until Dec 31" is weighed against a fixed today; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** A whole answer: places open beside the panel (`onGo`), questions ask again (`onAsk`), the approval is the panel's. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "The Acme logo" })).toBeInTheDocument();
    await expect(canvas.getByText("May use, with conditions")).toBeInTheDocument();
    await expect(canvas.getByText(/The 2019 logo was replaced/)).toBeInTheDocument();
    await expect(canvas.getByRole("table")).toHaveTextContent("Owned");
    await expect(canvas.getByText("The approval card for act_logo (the panel draws it)")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "the docs" })).toHaveAttribute("target", "_blank");
    // A chip goes to its place beside the panel, not away from the page.
    await userEvent.click(canvas.getByRole("link", { name: /Acme's rules/ }));
    await expect(args.onGo).toHaveBeenCalledWith("/brands/acme/rules");
    await userEvent.click(canvas.getAllByRole("link", { name: "acme-logo.svg" })[0]);
    await expect(args.onGo).toHaveBeenLastCalledWith(`/?asset=${LOGO}`);
    await userEvent.click(canvas.getByRole("link", { name: /Ada Lovelace/ }));
    await expect(args.onGo).toHaveBeenLastCalledWith("/team");
    await userEvent.click(canvas.getByRole("button", { name: "Which logo for dark grounds?" }));
    await expect(args.onAsk).toHaveBeenCalledWith("Which logo for dark grounds?");
  },
});

/** A swatch copies its HEX, and says so where it is. */
export const CopyAColor = meta.story({
  args: { text: "Primary: [[color:#2f62ff|Acme Blue]]." },
  beforeEach: () => {
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => write.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    const swatch = canvas.getByRole("button", { name: /Acme Blue/ });
    await userEvent.click(swatch);
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#2f62ff");
    await expect(within(swatch).getByText("Copied")).toBeInTheDocument();
  },
});

/** While it streams: a block not yet closed is left out rather than shown half-written, and the questions wait for the end. */
export const Streaming = meta.story({
  args: { streaming: true, text: `Checking the rights of [[asset:${LOGO}|acme-logo.svg]]...\n\n[[verdict:ye` },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Checking the rights of/)).toBeInTheDocument();
    await expect(canvas.queryByText(/\[\[verdict/)).not.toBeInTheDocument();
  },
});

/** The first words: one line, still coming. */
export const Loading = meta.story({ args: { streaming: true, text: "Looking through" } });

/** A refusal: may not use, with why, and what to use instead. */
export const Refused = meta.story({
  args: { text: `[[verdict:no|Its license ended [[date:2026-09-30|until]].]]\n\nUse [[asset:${HERO}|hero-spring.jpg]] instead.` },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("May not use")).toBeInTheDocument();
  },
});

/** What the model wrote wrong is drawn as its words, never as brackets or markup. */
export const MalformedBlocks = meta.story({
  args: { text: "A color that isn't one: [[color:#zzzzzz|Mystery]], and a place that isn't: [[open:../admin|Admin]]." },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/\[\[color:#zzzzzz\|Mystery\]\]/)).toBeInTheDocument();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
});

/** An earlier answer: its questions are not drawn (no `onAsk`). */
export const EarlierAnswer = meta.story({
  args: { onAsk: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Which logo for dark grounds?" })).not.toBeInTheDocument();
  },
});

/** A viewer can't open Team: a person is a name, not a link. */
export const Viewer = meta.story({
  args: { text: "[[person:usr_ada|Ada Lovelace]] approved it." },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ada Lovelace")).toBeInTheDocument();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
});

/** Long names truncate in their chips. */
export const LongNames = meta.story({
  args: {
    text: `[[asset:${HERO}|acme-international-holdings-partner-programme-hero-image-final-v3-approved.jpg]] is in [[collection:${PRESS}|Spring launch 2026 regional partner assets for EMEA resellers]].`,
  },
});

/** One line of the grammar, as an approval card's rows are written. */
export const Line = meta.story({
  render: (args) => <AnswerLine text={`Replace [[asset:${LOGO}|acme-logo.svg]] in [[brand:acme|Acme]] from [[date:2026-10-20]]`} onGo={args.onGo} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Acme/ })).toHaveAttribute("href", "/brands/acme");
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
