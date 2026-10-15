import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import { NOW } from "#.storybook/fixtures/brands";
import { Audit, type AuditPage } from "@/components/settings/access";

const hours = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const entry = (id: string, h: number, action: AuditPage["data"][number]["action"], target: string | null, detail: Record<string, unknown> | null = null, ip: string | null = null) => ({
  id,
  at: hours(h),
  actor: "Ada Lovelace",
  action,
  target,
  detail,
  ip,
});
const page: AuditPage = {
  data: [
    entry("aud_1", 1, "grant.set", "Grace Hopper", { scope: "write", on: "Acme" }),
    entry("aud_2", 2, "key.created", "Northwind sync"),
    entry("aud_3", 3, "share.created", "Press kit", { kind: "view", password: true }),
    entry("aud_4", 4, "user.signed_in", null, null, "203.0.113.7"),
    entry("aud_5", 30, "invitation.created", "sam@acme.test", { scope: "propose" }),
    entry("aud_6", 50, "key.revoked", "Old CI key"),
  ],
  next: "2026-10-13T10:00:00.000Z",
};

const meta = preview.meta({
  title: "App/Features/Settings/Audit log",
  component: Audit,
  args: { first: page },
  parameters: { nextjs: { navigation: { pathname: "/team", query: {} } } },
  beforeEach: () => {
    // "1 hour ago" read against a fixed now; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** Who changed who may do what, newest first, by day; sign-ins left to their own tab. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("gave access to")).toBeInTheDocument();
    await expect(canvas.queryByText("signed in")).not.toBeInTheDocument();
  },
});

/** Keys: only API keys made and revoked. */
export const Keys = meta.story({
  parameters: { nextjs: { navigation: { pathname: "/team", query: { audit: "keys" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "Keys" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas.getByText("made the API key")).toBeInTheDocument();
    await expect(canvas.getByText("revoked the API key")).toBeInTheDocument();
    await expect(canvas.queryByText("gave access to")).not.toBeInTheDocument();
  },
});

/** Sign-ins, with where from. */
export const SignIns = meta.story({
  parameters: { nextjs: { navigation: { pathname: "/team", query: { audit: "signins" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("from 203.0.113.7")).toBeInTheDocument();
  },
});

/** Nothing under a filter in what is loaded: there may be more further back. */
export const NothingUnderFilter = meta.story({
  args: { first: { data: page.data.filter((e) => !e.action.startsWith("key.")), next: page.next } },
  parameters: { nextjs: { navigation: { pathname: "/team", query: { audit: "keys" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("There may be some further back.")).toBeInTheDocument();
  },
});

/** Load older: the next page, after the last entry. */
export const LoadOlder = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/audit", () => HttpResponse.json({ data: [entry("aud_7", 80, "project.renamed", "Acme Library")] }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Load older" }));
    await waitFor(() => expect(canvas.getByText("Acme Library")).toBeInTheDocument());
    await expect(canvas.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument();
  },
});

/** A new organization: nothing yet. */
export const Empty = meta.story({ args: { first: { data: [], next: null } } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
