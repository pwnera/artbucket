import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { Window } from "happy-dom";
import type { Transport } from "./use-builder.ts";
import type { Status } from "./use-status.ts";

// A browser to render into, in place before react-dom looks for one.
const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });

// The "@/" paths tsconfig.json maps, which node doesn't know: files under src/.
const src = new URL("../../", import.meta.url).href;
register(
  `data:text/javascript,${encodeURIComponent(
    `export const resolve = (s, c, next) => next(s.startsWith("@/") ? ${JSON.stringify(src)} + s.slice(2) + ".ts" : s, c);`,
  )}`,
);

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useStatus } = await import("./use-status.ts");

const STATUS: Status = { steps: [], done: 0, total: 0, score: 0, next: null, publish: "never", live: null, portals: null, hub: null };

test("useStatus reads once, however often its caller hands it a new transport", async () => {
  const reads: string[] = [];
  let shown: Status | null = null;
  function Probe() {
    // A new function each render, as the production build's inlined default is. Each answer
    // renders again; past a few reads it stops answering, so a loop fails here instead of hanging.
    const transport: Transport = async (_method, url) => {
      reads.push(url);
      return reads.length > 5 ? new Promise(() => {}) : { ok: true, data: { ...STATUS } };
    };
    shown = useStatus("default", transport).status;
    return null;
  }

  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  // Drawn again by its parent, as the builder is on every change.
  for (let i = 0; i < 3; i++) await act(async () => root.render(createElement(Probe)));
  await act(async () => root.unmount());

  assert.deepEqual(reads, ["/api/v1/brands/default/status"]);
  assert.deepEqual(shown, STATUS);
});

test.after(() => win.happyDOM.close());
