import preview from "#.storybook/preview";
import { inApp } from "#.storybook/fixtures/library";
import { partners, sitesApi } from "#.storybook/fixtures/sites";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { RequestsPage } from "@/components/requests-page";

let patched: string | null = null;

/** The Inbox's Requests (/requests): every site's, each naming its site, answered in place. */
const meta = preview.meta({
  title: "App/Features/Inbox/Requests",
  component: RequestsPage,
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/requests" } } },
  beforeEach: ({ msw }) => {
    patched = null;
    msw.use(
      ...sitesApi(),
      http.patch("/api/v1/sites/:id/requests/:request", ({ params }) => {
        patched = `${params.id}/${params.request}`;
        return HttpResponse.json({ data: { id: params.request, email: "lena@northwind.test", name: "Lena Park", note: null, kind: "access", status: "approved", expiresAt: "2027-01-13T10:00:00Z", url: null, createdAt: "2026-10-15T08:00:00Z", page: null, section: null }, emailed: true });
      }),
    );
  },
});

/** Someone asking into the partner hub, approved from the Inbox: the answer goes to that site. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("Lena Park · lena@northwind.test")).toBeInTheDocument();
    await expect(canvas.getAllByText(/on Partner hub/).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getAllByRole("button", { name: "Approve" })[0]);
    await waitFor(() => expect(patched).toBe(`${partners.id}/req_lena`));
    await expect(await screen.findByText("lena@northwind.test has access, and a link by email")).toBeInTheDocument();
  },
});

/** Nobody has asked anything yet. */
export const Empty = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/sites/requests", () => HttpResponse.json({ data: [] }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nobody has asked yet")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
