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
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, ".storybook"), storybookScript: "pnpm storybook --no-open" })],
        test: {
          name: "storybook",
          browser: { enabled: true, headless: true, provider: playwright({ contextOptions: { reducedMotion: "reduce" } }), instances: [{ browser: "chromium" }] },
        },
      },
    ],
    coverage: { provider: "v8", include: ["src/components/**/*.tsx", "kit/ui/*.js"], exclude: ["**/*.stories.tsx"], reporter: ["text-summary", "html", "json-summary"] },
  },
});
