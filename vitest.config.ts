import path from "node:path";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Every story as a test (`pnpm test:stories`): rendered in headless Chromium, checked by axe (a violation fails it)
 * and its play function run. The app's own unit tests stay on node --test (`pnpm test`).
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        // Bundled up front: addon-a11y imports axe-core lazily, and a cold cache (CI) that finds it mid-run
        // re-optimizes and reloads, failing whichever story was loading it.
        optimizeDeps: { include: ["@storybook/addon-a11y > axe-core"] },
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, ".storybook"), storybookScript: "pnpm storybook --no-open" })],
        test: {
          name: "storybook",
          // ponytail: one retry on CI, where ~180 story files load in parallel and Chromium now and then fails to fetch a
          // module the server has (seen: addon-a11y's axe-core chunk, with nothing re-optimized). A story that fails twice
          // still fails the run; drop this once the browser runner stops dropping fetches under load.
          retry: process.env.CI ? 1 : 0,
          browser: { enabled: true, headless: true, provider: playwright({ contextOptions: { reducedMotion: "reduce" } }), instances: [{ browser: "chromium" }] },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/components/**/*.tsx", "kit/ui/*.js"],
      exclude: ["**/*.stories.tsx"],
      reporter: ["text-summary", "html", "json-summary"],
      // Just under where it stands: a component added without stories fails the run.
      thresholds: { lines: 80, statements: 77, functions: 73, branches: 71 },
    },
  },
});
