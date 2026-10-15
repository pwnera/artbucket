import preview from "#.storybook/preview";
import { me, withMe } from "#.storybook/fixtures/brands";
import { renditions } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { useEffect } from "react";
import { expect, fn, screen, spyOn, waitFor, within } from "storybook/test";
import { AskButton, AssistantAsset, AssistantPanel, AssistantProvider, useAssistant } from "@/components/assistant";

const ASSISTANT = me.assistant!;
const LOGO = "6700995f-e0d8-4e6b-a64f-7abbf7ec1752";

/** The panel's start (GET {url}): the project, the person's conversations here, and questions to start from. */
const start = {
  notice: null,
  project: "Acme",
  chats: [
    { id: "chat_logos", title: "Which logo goes on dark backgrounds?" },
    { id: "chat_rights", title: "Can we use the autumn hero in print?" },
  ],
  ideas: {
    library: ["Which logo do I use on a dark background?", "What changed in the last release?", "Find photos we may use in print"],
    asset: ["What does this show?", "May I use it on social?"],
  },
};

/** An answer, as the server streams it: JSON lines, a beat apart, so the words arrive while the test looks. */
type Event = Record<string, unknown>;
function lines(events: Event[], gap = 120) {
  const encode = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(c) {
      for (const e of events) {
        c.enqueue(encode.encode(`${JSON.stringify(e)}\n`));
        await new Promise((r) => setTimeout(r, gap));
      }
      c.close();
    },
  });
}
const streamed = (events: Event[], gap?: number) => new HttpResponse(lines(events, gap), { headers: { "content-type": "application/x-ndjson" } });

/** A question about the logo, answered: it reads the rules, says so, then writes in four parts. */
const LOGO_ANSWER: Event[] = [
  { type: "chat", id: "chat_new" },
  { type: "tool", label: "Reading the brand rules" },
  { type: "working", text: "Checking the logo rules for dark grounds." },
  { type: "tool", label: "Searching assets" },
  { type: "text", text: "On dark backgrounds use " },
  { type: "text", text: `[[asset:${LOGO}|acme-logo-light.svg]], ` },
  { type: "text", text: "the light logo, with clear space of one mark height. " },
  { type: "text", text: "Never the 2019 logo: it was replaced." },
];

/** What each POST to {url}/ask carried, newest last. */
let asked: Record<string, unknown>[] = [];
const ask = (answer: (body: Record<string, unknown>, n: number) => Response) =>
  http.post(`${ASSISTANT}/ask`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    asked.push(body);
    return answer(body, asked.length);
  });

/** Opens the panel as Ask in the sidebar would, once mounted. */
function Opened() {
  const a = useAssistant();
  const setOpen = a?.setOpen;
  useEffect(() => setOpen?.(true), [setOpen]);
  return null;
}

const box = () => screen.getByRole("textbox", { name: "Your question" });

/**
 * The server's assistant (ASSISTANT_URL), in a panel beside the page: ask about the library, see the answer written
 * as it streams in with the steps it took, approve the changes it asks to make, and go back to past conversations.
 * Docked on the right on a wide screen; over the whole screen on a phone, as here.
 */
const meta = preview.meta({
  title: "App/Features/AI/Assistant",
  component: AssistantPanel,
  decorators: [withMe(me)],
  args: { open: true, onChanged: fn() } as { open?: boolean; onChanged?: () => void },
  parameters: { layout: "fullscreen" },
  render: ({ open, onChanged }) => (
    <AssistantProvider url={ASSISTANT} onChanged={onChanged!}>
      {open && <Opened />}
      <div className="p-4">
        <AskButton />
      </div>
      <AssistantPanel />
    </AssistantProvider>
  ),
  beforeEach: ({ msw }) => {
    asked = [];
    msw.use(
      ...renditions,
      http.get(ASSISTANT, () => HttpResponse.json({ data: start })),
      ask(() => streamed(LOGO_ANSWER)),
    );
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => {
      copy.mockRestore();
      try {
        sessionStorage.removeItem("assistant:chat");
      } catch {}
    };
  },
});

/**
 * Ask opens it; a question goes with Enter. The answer streams in: what it is doing now, then the words, a few at a
 * time. Once written, the steps fold above it and the answer can be copied.
 */
export const Playground = meta.story({
  args: { open: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    const panel = await screen.findByRole("complementary", { name: "Assistant" });
    await expect(await within(panel).findByRole("heading", { name: "Ask Artbucket" })).toBeInTheDocument();
    await userEvent.type(box(), "Which logo do I use on a dark background?{Enter}");
    await expect(box()).toHaveValue("");
    // Mid-answer: the first words are in, it says it is writing, and the rest is still to come.
    await expect(await within(panel).findByText(/On dark backgrounds use/)).toBeInTheDocument();
    await expect(within(panel).getByText("Writing")).toBeInTheDocument();
    await expect(within(panel).queryByText(/Never the 2019 logo/)).not.toBeInTheDocument();
    // Done: the whole answer, how it got there, and Copy.
    await expect(await within(panel).findByText(/Never the 2019 logo: it was replaced\./, {}, { timeout: 3000 })).toBeInTheDocument();
    await expect(await within(panel).findByText(/Worked for \d+s · 2 steps/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Copy the answer" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Never the 2019 logo"));
    await expect(asked[0]).toMatchObject({ question: "Which logo do I use on a dark background?", chat: null, embed: true });
    // The conversation is named after the question.
    await expect(within(panel).getByText("Which logo do I use on a dark background?", { selector: "header *" })).toBeInTheDocument();
  },
});

/** Questions to start from: one tap asks it. */
export const Ideas = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "What changed in the last release?" }));
    await expect(await screen.findByText(/Never the 2019 logo/, {}, { timeout: 3000 })).toBeInTheDocument();
    await expect(asked[0]).toMatchObject({ question: "What changed in the last release?" });
  },
});

/** The answer failed: said under the question, with Retry, which asks it again. */
export const Failed = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      ask((_, n) =>
        n === 1 ? HttpResponse.json({ error: { message: "The assistant is busy. Try again in a minute." } }, { status: 503 }) : streamed(LOGO_ANSWER, 20),
      ),
    ),
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("textbox", { name: "Your question" }), "Which logo do I use on a dark background?{Enter}");
    await expect(await screen.findByText("The assistant is busy. Try again in a minute.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await expect(await screen.findByText(/Never the 2019 logo/, {}, { timeout: 3000 })).toBeInTheDocument();
    await expect(screen.queryByText("The assistant is busy. Try again in a minute.")).not.toBeInTheDocument();
    await expect(screen.getAllByText("Which logo do I use on a dark background?", { selector: "p" })).toHaveLength(1);
  },
});

/** It broke off mid-answer: what was written stays, and the error follows it. */
export const BrokeOff = meta.story({
  beforeEach: ({ msw }) => void msw.use(ask(() => streamed([...LOGO_ANSWER.slice(0, 5), { type: "error", message: "The answer was cut short." }], 20))),
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("textbox", { name: "Your question" }), "Which logo do I use?{Enter}");
    await expect(await screen.findByText("The answer was cut short.")).toBeInTheDocument();
    await expect(screen.getByText(/On dark backgrounds use/)).toBeInTheDocument();
  },
});

/** The assistant didn't answer at all: Try again asks it again. */
export const Unreachable = meta.story({
  beforeEach: ({ msw }) => {
    let calls = 0;
    msw.use(http.get(ASSISTANT, () => (++calls === 1 ? HttpResponse.json({ error: { message: "Down" } }, { status: 502 }) : HttpResponse.json({ data: start }))));
  },
  play: async ({ userEvent }) => {
    await expect(await screen.findByRole("heading", { name: "The assistant can't be reached" })).toBeInTheDocument();
    await expect(screen.queryByRole("textbox", { name: "Your question" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await expect(await screen.findByRole("heading", { name: "Ask Artbucket" })).toBeInTheDocument();
  },
});

/** Closed to this person here (the plan, or the project's settings): the server's words and its way forward. */
export const Closed = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(ASSISTANT, () =>
        HttpResponse.json({ data: { notice: { code: "plan", title: "The assistant comes with Team", text: "Ask about your library, check rights and make changes, on Team and Business.", href: "/billing", label: "See plans" } } }),
      ),
    ),
  play: async () => {
    await expect(await screen.findByRole("heading", { name: "The assistant comes with Team" })).toBeInTheDocument();
    await expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
    await expect(screen.getByRole("button", { name: "History" })).toBeDisabled();
  },
});

/** A change it asks to make: what it will do, then Approve or Decline. Approved, it is made and the page beside it refreshes. */
export const Approval = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      ask((_, n) =>
        n === 1
          ? streamed(
              [
                { type: "chat", id: "chat_tags" },
                { type: "tool", label: "Searching assets" },
                { type: "text", text: "I found the autumn hero. I can tag it for print:" },
                { type: "approval", id: "act_1", name: "update_asset", label: "Tag autumn-campaign-hero.jpg", details: [{ label: "Tags", value: "print, autumn" }] },
              ],
              20,
            )
          : streamed([{ type: "action", id: "act_1", state: "done" }, { type: "text", text: "Tagged it." }], 20),
      ),
    ),
  play: async ({ args, userEvent }) => {
    await userEvent.type(await screen.findByRole("textbox", { name: "Your question" }), "Tag the autumn hero for print{Enter}");
    await expect(await screen.findByText("Needs your approval")).toBeInTheDocument();
    await expect(screen.getByText("print, autumn")).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: "Approve" });
    await waitFor(() => expect(approve).toHaveFocus());
    await userEvent.click(approve);
    await expect(await screen.findByText("Tagged it.")).toBeInTheDocument();
    await expect(screen.getByText("Done.")).toBeInTheDocument();
    await expect(asked[1]).toEqual({ chat: "chat_tags", approvals: [{ id: "act_1", approved: true }], embed: true });
    await waitFor(() => expect(args.onChanged).toHaveBeenCalledOnce());
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** A delete asks with what it takes away, in red; Decline says nothing changed. */
export const DeclineADelete = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      ask((_, n) =>
        n === 1
          ? streamed(
              [
                { type: "chat", id: "chat_del" },
                { type: "approval", id: "act_2", name: "delete_asset", label: "Delete acme-logo-2019.svg", note: "Two guideline pages still show it.", details: [{ label: "Asset", value: "acme-logo-2019.svg" }] },
              ],
              20,
            )
          : streamed([{ type: "action", id: "act_2", state: "declined" }, { type: "text", text: "Left it as it is." }], 20),
      ),
    ),
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("textbox", { name: "Your question" }), "Delete the 2019 logo{Enter}");
    await expect(await screen.findByText("Two guideline pages still show it.")).toBeInTheDocument();
    // Asked once the answer has stopped: the card has the focus then.
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await expect(await screen.findByText("Left it as it is.")).toBeInTheDocument();
    await expect(screen.getByText("Declined. Nothing changed.")).toBeInTheDocument();
    await expect(asked[1]).toMatchObject({ approvals: [{ id: "act_2", approved: false }] });
  },
});

/** A long conversation, read back from the tab's last one: it opens at the end. History goes to another. */
export const LongThread = meta.story({
  beforeEach: ({ msw }) => {
    sessionStorage.setItem("assistant:chat", "chat_logos");
    const turns = Array.from({ length: 12 }, (_, i) => ({
      question: i % 2 ? `And on the ${["website", "packaging", "trade show booth", "newsletter", "app icon", "invoice"][i % 6]}?` : `Which logo goes on surface ${i + 1}?`,
      answer: `Use [[asset:${LOGO}|acme-logo-light.svg]] there, at least 24 px tall, with clear space of one mark height on every side. ${"Keep it off busy photos. ".repeat(3)}`,
      steps: [{ tool: "Reading the brand rules" }],
    }));
    msw.use(
      http.get(`${ASSISTANT}/chats/chat_logos`, () => HttpResponse.json({ data: { id: "chat_logos", title: "Which logo goes on dark backgrounds?", turns } })),
      http.get(`${ASSISTANT}/chats/chat_rights`, () =>
        HttpResponse.json({ data: { id: "chat_rights", title: "Can we use the autumn hero in print?", turns: [{ question: "Can we use the autumn hero in print?", answer: "Yes, until 31 December 2026.", steps: [] }] } }),
      ),
    );
  },
  play: async ({ userEvent }) => {
    const panel = await screen.findByRole("complementary", { name: "Assistant" });
    await expect(await within(panel).findByText("Which logo goes on surface 11?")).toBeInTheDocument();
    await expect(within(panel).getAllByRole("button", { name: "Copy the answer" })).toHaveLength(12);
    await userEvent.click(within(panel).getByRole("button", { name: "History" }));
    const history = within(panel).getByRole("navigation", { name: "Recent conversations" });
    await expect(history).toHaveTextContent("Recent conversations in Acme");
    await userEvent.click(within(history).getByRole("button", { name: "Can we use the autumn hero in print?" }));
    await expect(await within(panel).findByText("Yes, until 31 December 2026.")).toBeInTheDocument();
    await expect(sessionStorage.getItem("assistant:chat")).toBe("chat_rights");
    // New chat starts afresh.
    await userEvent.click(within(panel).getByRole("button", { name: "New chat" }));
    await expect(await within(panel).findByRole("heading", { name: "Ask Artbucket" })).toBeInTheDocument();
  },
});

/** With an asset open in the app: "this" means it, and the questions to start from are about it. */
export const AboutAnAsset = meta.story({
  render: ({ onChanged }) => (
    <AssistantProvider url={ASSISTANT} onChanged={onChanged!}>
      <Opened />
      <AssistantAsset id="ast_hero" />
      <AssistantPanel />
    </AssistantProvider>
  ),
  play: async () => {
    await expect(await screen.findByRole("heading", { name: "Ask about this asset" })).toBeInTheDocument();
    await expect(screen.getByText("About this asset")).toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "May I use it on social?" })).toBeInTheDocument();
  },
});

/** Escape closes it; Expand covers the window (wide screens only). */
export const Close = meta.story({
  play: async ({ canvas, userEvent }) => {
    const panel = await screen.findByRole("complementary", { name: "Assistant" });
    // The panel's own Ask sends a question; the way in is the one that toggles.
    await expect(canvas.getByRole("button", { name: "Ask", pressed: true })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(panel).not.toBeVisible());
    await expect(canvas.getByRole("button", { name: "Ask", pressed: false })).toBeInTheDocument();
  },
});

/** Docked beside the page on a laptop, its left edge dragged (or moved with the arrow keys) to resize it. */
export const Docked = meta.story({
  globals: { viewport: { value: "laptop" } },
  beforeEach: () => {
    const kept = localStorage.getItem("assistant:width");
    localStorage.removeItem("assistant:width");
    return () => (kept === null ? localStorage.removeItem("assistant:width") : localStorage.setItem("assistant:width", kept));
  },
  play: async ({ userEvent }) => {
    const edge = await screen.findByRole("separator", { name: "Resize the assistant" });
    const before = Number(edge.getAttribute("aria-valuenow"));
    edge.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(Number(edge.getAttribute("aria-valuenow"))).toBe(before + 20);
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
