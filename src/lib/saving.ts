/**
 * Whether the page's writes landed: how many are in flight, whether the last
 * one failed and when, and when one last succeeded. send() tracks every non-GET, so
 * SaveStatus can say Saving, Saved or Not saved without each editor
 * threading its own flag. One store per tab, read with useSyncExternalStore.
 */

export type Saving = { inFlight: number; failedAt: number | null; savedAt: number | null };

let state: Saving = { inFlight: 0, failedAt: null, savedAt: null };
const listeners = new Set<() => void>();

function set(next: Partial<Saving>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const snapshot = () => state;
export const IDLE: Saving = { inFlight: 0, failedAt: null, savedAt: null };

/** Counts `p` as a write: null (send()'s failure) or a rejection is Not saved. */
export async function track<T>(p: Promise<T>): Promise<T> {
  set({ inFlight: state.inFlight + 1 });
  let ok = false;
  try {
    const r = await p;
    ok = r !== null;
    return r;
  } finally {
    set({ inFlight: state.inFlight - 1, ...(ok ? { failedAt: null, savedAt: Date.now() } : { failedAt: Date.now() }) });
  }
}
