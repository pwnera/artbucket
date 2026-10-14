import type { StorybookConfig } from "@storybook/nextjs-vite";

/**
 * The core's components, the app's and the brand site's, where they are built and checked: `pnpm storybook`.
 * Stories sit beside their component (`*.stories.tsx`); the kit's (@artbucket/ui) in kit/ui. Artbucket Cloud
 * publishes the build at storybook.artbucket.io.
 */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/**/*.stories.tsx", "../kit/ui/*.stories.tsx"],
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};
export default config;
