import { toast } from "sonner";
import { track } from "@/lib/saving";

/** Whatever the API sent back: res.json() types it as any, and callers read it as their own shape. */
type Json = Awaited<ReturnType<Response["json"]>>;

/** The API's error body (lib/api.ts fail()): Zod failures name the offending properties in `detail`. */
export type ApiError = { code?: string; message?: string; detail?: { properties?: Record<string, unknown> } & Record<string, unknown> };

export type Sent =
  | { ok: true; data: Json }
  | { ok: false; network: true }
  | { ok: false; network: false; status: number; error: ApiError | null };

// Browsers cap keepalive bodies in flight at 64KB in total and reject the
// fetch past it, so the budget is shared, not per request.
const KEEPALIVE = 60_000;
let alive = 0;

/**
 * fetch + JSON, and never a throw: a dropped connection, a timeout and an
 * API error each come back as a result. Toasts say what went wrong unless
 * `quiet`, for a form that maps error.detail onto its fields; being offline
 * or signed out still toasts, since no field can say that. Every non-GET
 * counts toward SaveStatus.
 */
export function sendResult(
  method: string,
  url: string,
  payload?: unknown,
  { quiet = false, headers }: { quiet?: boolean; headers?: Record<string, string> } = {},
): Promise<Sent> {
  const p = attempt(method, url, payload, quiet, headers);
  if (method !== "GET") void track(p.then((r) => r.ok || null));
  return p;
}

/** fetch + JSON + a toast on failure. Resolves to `data`, or null when it failed. */
export const send = (method: string, url: string, payload?: unknown): Promise<Json> =>
  sendResult(method, url, payload).then((r) => (r.ok ? r.data : null));

async function attempt(method: string, url: string, payload: unknown, quiet: boolean, headers?: Record<string, string>): Promise<Sent> {
  const body = payload ? JSON.stringify(payload) : undefined;
  // A save started on blur should survive the tab closing under it.
  const size = body && body.length < KEEPALIVE ? new TextEncoder().encode(body).length : Infinity;
  const keepalive = method !== "GET" && alive + size <= KEEPALIVE;
  if (keepalive) alive += size;
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body,
      keepalive,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const error: ApiError | null = (await res.json().catch(() => null))?.error ?? null;
      complain({ status: res.status, error }, quiet);
      return { ok: false, network: false, status: res.status, error };
    }
    return { ok: true, data: res.status === 204 ? {} : ((await res.json()).data ?? {}) };
  } catch {
    complain(null);
    return { ok: false, network: true };
  } finally {
    if (keepalive) alive -= size;
  }
}

/**
 * Says what went wrong with a request, as sendResult does: null for one that
 * never got an answer. Being offline or signed out always toasts; an API
 * error only unless `quiet`, for a caller that shows it where it happened.
 */
export function complain(failure: { status: number; error: ApiError | null } | null, quiet = false) {
  if (!failure) {
    // "May not": a request that timed out can still land on the server.
    return void toast.error("Couldn't reach the server", {
      id: "offline",
      duration: 10_000,
      description: "Your last change may not have saved. Check the connection and try again.",
    });
  }
  const { status, error } = failure;
  // A share or portal password is a 401 too, and not a lapsed session.
  if (status === 401 && error?.code !== "password") {
    toast.error("You've been signed out", {
      id: "signed-out",
      duration: Infinity,
      description: "Sign in again, then redo your last change.",
      action: {
        label: "Sign in",
        // A full load, on purpose: nothing of the lapsed session should survive into the next one.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        onClick: () => location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`),
      },
    });
  } else if (!quiet) {
    // Zod detail names the offending property; surface it with the message.
    const where = error?.detail?.properties ? Object.keys(error.detail.properties).join(", ") : "";
    toast.error(`${error?.message ?? "Something went wrong"}${where ? ` (${where})` : ""}`, { duration: 10_000 });
  }
}

/**
 * A raw fetch's refusal (an upload, which needs its own fetch for progress
 * and cancelling), taken as sendResult takes one: the signed-out toast on a
 * lapsed session, and the message to show where it failed.
 */
export async function refusal(res: Response, fallback: string): Promise<string> {
  const error: ApiError | null = (await res.json().catch(() => null))?.error ?? null;
  complain({ status: res.status, error }, true);
  return res.status === 401 && error?.code !== "password" ? "Signed out: sign in and try again" : (error?.message ?? fallback);
}

/** What to show for a request that threw: a dropped connection is the network's fault, not the file's ("Failed to fetch", "Load failed"). */
export const reason = (e: unknown, fallback: string) =>
  e instanceof TypeError ? "Couldn't reach the server" : e instanceof Error ? e.message : fallback;
