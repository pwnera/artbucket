import { useSearchParams } from "@storybook/nextjs-vite/navigation.mock";
import { useSyncExternalStore } from "react";
import { mocked } from "storybook/test";

/**
 * Artbucket's names where Acme's were, for artbucket.io, which frames these stories to show the app as it is
 * (`iframe.html?id=...&globals=fixture:artbucket`): the same made-up people, files and numbers, on our own brand.
 * The preview swaps a story's args; `inApp`, `as` and `withMe` swap who is looking and the sidebar.
 * ponytail: a swap of names, so every story has it at once; what was written for Acme beyond its name (a partner,
 * a picture) stays as it was. A story that needs more gets args of its own when the site frames it.
 */
const NAMES: [RegExp, string][] = [
  [/Acme Inc/g, "Artbucket"],
  [/acme\.test/g, "artbucket.io"],
  [/Acme/g, "Artbucket"],
  [/acme/g, "artbucket"],
];

const swap = (v: unknown): unknown => {
  if (typeof v === "string") return NAMES.reduce((s, [from, to]) => s.replace(from, to), v);
  if (Array.isArray(v)) return v.map(swap);
  // Plain data only: a React element, a function or a Date passes as it is.
  if (typeof v === "object" && v && Object.getPrototypeOf(v) === Object.prototype && !("$$typeof" in v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
  return v;
};

/** `value` as the story's fixture global asks: Acme's own, or with Artbucket's names. */
export const fixture = <T>(globals: Record<string, unknown>, value: T): T => (globals.fixture === "artbucket" ? (swap(value) as T) : value);

/** Back to Acme's names: an id or a path a swapped story asks for, as the fixtures know it. */
export const toAcme = (s: string) => s.replace(/artbucket\.io/g, "acme.test").replace(/Artbucket/g, "Acme").replace(/artbucket/g, "acme");

/**
 * The same swap for what a framed story's page fetches (MSW answers in Acme's names): `beforeEach: swapApi`. The
 * app's own `/api/` answers come back with our names, and the paths it asks go back to Acme's, so the fixtures'
 * handlers still match the ids the swapped args carry (`prj_artbucket` asks for `prj_acme`).
 * ponytail: a text swap on JSON, per story; make it the preview's when most framed stories fetch.
 */
export const swapApi = ({ globals }: { globals: Record<string, unknown> }) => {
  if (globals.fixture !== "artbucket") return;
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return real(input, init);
    const asked = new URL(toAcme(url.pathname) + toAcme(url.search), url.origin).href;
    const res = await real(input instanceof Request ? new Request(asked, input) : asked, init);
    if (!res.headers.get("content-type")?.includes("json")) return res;
    const text = NAMES.reduce((s, [from, to]) => s.replace(from, to), await res.text());
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  return () => void (window.fetch = real);
};

/**
 * A page that moves by `window.history` (the library's search, filters and viewer) live in its frame, as Next.js has
 * it: what it pushes lands in the frame's own URL beside Storybook's `id`, and `useSearchParams` follows it. The app
 * ignores Storybook's params, so a reload, or Back, keeps the story. `beforeEach: liveUrl`, the story opening at its
 * `parameters.nextjs.navigation.query`.
 */
export const liveUrl = ({ parameters }: { parameters: { nextjs?: { navigation?: { query?: Record<string, string> } } } }) => {
  const { pushState, replaceState } = window.history;
  const own = new URLSearchParams(location.search);
  const keep = ["id", "viewMode", "globals", "args"].filter((k) => own.has(k));
  const changed = () => window.dispatchEvent(new Event("liveurl"));
  const moved = (go: typeof pushState) => (state: unknown, _: string, to?: string | URL | null) => {
    if (to == null) return go.call(window.history, state, "");
    const next = new URL(String(to), location.href).searchParams;
    for (const k of keep) next.set(k, own.get(k)!);
    go.call(window.history, state, "", `${location.pathname}?${next}`);
    changed();
  };
  window.history.pushState = moved(pushState);
  window.history.replaceState = moved(replaceState);
  // Where the story opens: its `nextjs.navigation.query`, in the URL the page reads.
  window.history.replaceState(null, "", `?${new URLSearchParams(parameters.nextjs?.navigation?.query)}`);
  const listen = (f: () => void) => {
    window.addEventListener("liveurl", f);
    window.addEventListener("popstate", f);
    return () => (window.removeEventListener("liveurl", f), window.removeEventListener("popstate", f));
  };
  let seen = { search: "", params: new URLSearchParams() };
  const read = () => (seen.search === location.search ? seen : (seen = { search: location.search, params: new URLSearchParams(location.search) })).params;
  mocked(useSearchParams).mockImplementation(() => useSyncExternalStore(listen, read) as ReturnType<typeof useSearchParams>);
  return () => {
    window.history.pushState = pushState;
    window.history.replaceState = replaceState;
    mocked(useSearchParams).mockReset();
  };
};
