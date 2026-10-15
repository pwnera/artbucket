import { delay, http, HttpResponse } from "msw";

/**
 * The API as stories see it (MSW): a save answers after a beat, so a pending state shows, and a read answers empty.
 * A story with data of its own adds handlers in `beforeEach: ({ msw }) => msw.use(...)`, which come before these.
 * `failing` refuses every write, for an error state.
 */
export const api = [
  http.get("/api/v1/*", async () => {
    await delay(150);
    return HttpResponse.json({ data: [] });
  }),
  http.all("/api/v1/*", async () => {
    await delay(300);
    return HttpResponse.json({ data: {} });
  }),
];

export const failing = http.all("/api/v1/*", async ({ request }) => {
  if (request.method === "GET") return HttpResponse.json({ data: [] });
  await delay(300);
  return HttpResponse.json({ error: { code: "invalid", message: "That name is taken" } }, { status: 422 });
});
