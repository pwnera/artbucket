import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

// The app's Google faces from google-fonts.json, not fonts.googleapis.com, whose failed fetch failed CI builds (google-fonts-refresh.mjs).
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES ??= fileURLToPath(new URL("./google-fonts.json", import.meta.url));

/**
 * The core's components, the app's and the brand site's, where they are built and checked: `pnpm storybook`.
 * Stories sit beside their component (`*.stories.tsx`); the kit's (@artbucket/ui) in kit/ui; the guides
 * (tokens, icons, how to write a story) in .storybook/docs. Every story is a test too (`pnpm test:stories`):
 * it renders in Chromium, passes axe, and runs its play function.
 */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["./docs/*.mdx", "../src/**/*.mdx", "../src/**/*.stories.tsx", "../kit/ui/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest", "msw-storybook-addon"],
  // .storybook/public holds MSW's worker, kept out of the app's own public/.
  staticDirs: ["../public", "./public"],
  core: { disableTelemetry: true },
  docs: { defaultName: "Docs" },
  typescript: { reactDocgen: "react-docgen-typescript" },
};
export default config;
