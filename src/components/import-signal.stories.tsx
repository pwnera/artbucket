import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect } from "storybook/test";
import { signalHint, useImportSignal, type ImportSignal } from "@/components/import-signal";
import { Badge } from "@/components/ui/badge";

/** What reads the signal: the sidebar's Brands badge and its hint, as components/app-sidebar.tsx draws them. */
function BrandsBadge({ url }: { url: string | null }) {
  const s = useImportSignal(url);
  const n = (s?.running ?? 0) + (s?.waiting ?? 0);
  return (
    <p className="flex items-center gap-2 text-sm">
      Brands
      {n > 0 && (
        <Badge variant="secondary" title={signalHint(s)}>
          {n}
        </Badge>
      )}
      <span className="text-muted-foreground">{signalHint(s) ?? "Nothing importing"}</span>
    </p>
  );
}

const signal = (s: ImportSignal) => http.get("/brand-import*", () => HttpResponse.json({ data: s }));

/**
 * Brand import's word to the rest of the app (useImportSignal): how many imports are at work, how many plans wait,
 * how many stopped. One request serves every reader, asked again every few seconds while something runs. Only where
 * the server offers brand import (me.brandImport).
 */
const meta = preview.meta({
  title: "App/Features/Library/Import signal",
  component: BrandsBadge,
  args: { url: "/brand-import" },
});

/** One import at work and two plans waiting for review. */
export const Running = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(signal({ running: 1, waiting: 2, stopped: 0, latest: { id: "imp_1", filename: "acme-brand-book.pdf", status: "running", label: "Reading pages", progress: { done: 12, total: 40 } } })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("1 import in progress, 2 plans waiting for review")).toBeInTheDocument();
  },
});

/** One stopped: said, with no badge. */
export const Stopped = meta.story({
  args: { url: "/brand-import/stopped" },
  beforeEach: ({ msw }) => void msw.use(signal({ running: 0, waiting: 0, stopped: 1, latest: null })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("1 stopped")).toBeInTheDocument();
  },
});

/** A server without brand import: nothing asked, nothing shown. */
export const Off = meta.story({
  args: { url: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing importing")).toBeInTheDocument();
  },
});
