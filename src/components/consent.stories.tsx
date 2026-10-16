import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";
import { Authorize, Device, ProjectPicker, ScopePicker, type Givable, type Options } from "@/components/consent";

const acme: Givable = { id: "prj_acme", name: "Acme", organization: "Acme Inc", max: "write" };
const northwind: Givable = { id: "prj_northwind", name: "Northwind", organization: "Acme Inc", max: "read" };
const options: Options = { client: { name: "Claude" }, scope: "write", project: "prj_acme", projects: [acme, northwind] };
const QUERY = "response_type=code&client_id=cli_claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=s7x2";
const request = Object.fromEntries(new URLSearchParams(QUERY));

/** What the page POSTed last, for a play test to read: reset before each story. */
let body: unknown;
const decided = (answer: unknown, status = 200) =>
  async ({ request: r }: { request: Request }) => {
    body = await r.json();
    return status === 200 ? HttpResponse.json({ data: answer }) : HttpResponse.json({ error: { code: "invalid", message: "This request expired. Start again from Claude." } }, { status });
  };

const meta = preview.meta({
  title: "App/Features/Consent",
  component: Authorize,
  args: { query: QUERY, initial: { data: options }, email: "ada@acme.test" },
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    body = undefined;
    // An answer that only moves the frame's hash: Allow and Cancel send the page to `redirect`.
    msw.use(http.post("/api/v1/oauth/authorize", decided({ redirect: "#connected" })));
  },
});

/** /oauth/authorize: a chat app asks to work as you; you pick where and how much, and where you go back to is named. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Connect Claude" })).toBeInTheDocument();
    await expect(canvas.getByText("ada@acme.test")).toBeInTheDocument();
    await expect(canvas.getByText(/go back to claude\.ai/)).toBeInTheDocument();
    await expect(canvas.getByRole("checkbox", { name: /^Acme/ })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: /Edit/ })).toBeChecked();
    // Admin is never offered to an agent.
    await expect(canvas.queryByRole("radio", { name: /Admin/ })).not.toBeInTheDocument();
  },
});

/** Approve: the request goes back with the projects and the scope picked. */
export const Approve = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Contributor/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(body).toEqual({ request, allow: true, projects: ["prj_acme"], scope: "propose" }));
    // Busy until the next page paints.
    await expect(canvas.getByRole("button", { name: "Allow" })).toHaveAttribute("aria-busy", "true");
  },
});

/** Deny: Cancel tells the chat app no. */
export const Deny = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(body).toEqual({ request, allow: false }));
  },
});

/** A second project where you may give less: ticking it brings the pick down, and it says what it gets. */
export const SeveralProjects = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Northwind/ }));
    await expect(canvas.getByText("Viewer here")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Acme/ }));
    // Only Northwind: read is the most it may get.
    await expect(canvas.getByRole("radio", { name: /Viewer/ })).toBeChecked();
    await expect(canvas.queryByRole("radio", { name: /Edit/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Northwind/ }));
    await expect(canvas.getByRole("button", { name: "Allow" })).toBeDisabled();
  },
});

/** The API refused the decision: why, with a way back to the choice. */
export const Refused = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/oauth/authorize", decided(null, 422))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Allow" }));
    await expect(await canvas.findByRole("heading", { name: "Couldn't connect Claude" })).toBeInTheDocument();
    await expect(canvas.getByText("This request expired. Start again from Claude.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByRole("button", { name: "Allow" })).toBeEnabled();
  },
});

/** A link that can't be used (expired, or a client that doesn't exist). */
export const BadLink = meta.story({
  args: { initial: { error: { message: "This authorization request expired. Start again from your chat app." } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Go to/ })).toHaveAttribute("href", "/");
  },
});

/** Someone with no project yet has nothing to give: only Cancel. */
export const NoProject = meta.story({
  args: { initial: { data: { ...options, project: null, projects: [] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/You have no project to give it yet/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  },
});

/** One project: named, not a box to tick. A long client name wraps in the heading. */
export const OneProject = meta.story({
  args: { initial: { data: { ...options, client: { name: "Northwind Campaign Planner for Regional Marketing Teams" }, projects: [acme] } } },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

// ---- /device: `artbucket login` ----

/** /device: type the code the terminal shows; the eighth letter looks it up, then the same choice, with the code to check. */
export const DeviceCode = meta.story({
  render: () => <Device email="ada@acme.test" />,
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/oauth/device/:code", () => HttpResponse.json({ data: { ...options, client: { name: "The Artbucket CLI" }, scope: "write" } })),
      http.post("/api/v1/oauth/device/:code", decided({ allowed: true })),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Code"), "wdjbmjht");
    await expect(await canvas.findByText("WDJB-MJHT")).toBeInTheDocument();
    await expect(canvas.getByText("Check it matches your terminal.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(body).toEqual({ allow: true, projects: ["prj_acme"], scope: "write" }));
    await expect(await canvas.findByRole("heading", { name: "Connected" })).toBeInTheDocument();
    await expect(canvas.getByText(/can now work in Acme as an Editor/)).toBeInTheDocument();
  },
});

/** A code that isn't one: said under the field, which stays to correct. */
export const DeviceWrongCode = meta.story({
  render: () => <Device email="ada@acme.test" />,
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/oauth/device/:code", () => HttpResponse.json({ error: { code: "not_found", message: "No such code. Check your terminal." } }, { status: 404 }))),
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText("Code");
    await userEvent.type(field, "abcdefgh");
    await expect(await canvas.findByRole("alert")).toHaveTextContent("No such code. Check your terminal.");
    await expect(field).toHaveAttribute("aria-invalid", "true");
  },
});

/** Turned down from /device: nothing connected, and another code may be entered. */
export const DeviceTurnedDown = meta.story({
  render: () => <Device email="ada@acme.test" code="WDJBMJHT" initial={{ data: options }} />,
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/oauth/device/:code", decided({ allowed: false }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(body).toEqual({ allow: false }));
    await expect(await canvas.findByRole("heading", { name: "Turned down" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Enter another code" }));
    await expect(canvas.getByLabelText("Code")).toHaveValue("");
  },
});

/** The pickers alone, as Connections uses them to make a key. */
export const Pickers = meta.story({
  render: () => (
    <div className="grid max-w-md gap-6 p-6">
      <ProjectPicker projects={[acme, northwind]} picked={["prj_acme", "prj_northwind"]} onChange={fn()} scope="write" />
      <ScopePicker max="write" value="propose" onChange={fn()} />
    </div>
  ),
});
