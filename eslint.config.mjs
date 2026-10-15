import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts", "cli/artbucket.js", ".storybook/public/**", "storybook-static/**", "coverage/**"] },
  ...coreWebVitals,
  ...typescript,
  // pnpm's strict layout hides react from the plugin's auto-detection.
  { settings: { react: { version: "19.3" } } },
  // The app is built from its components (components/ui, each with its stories): a hand-made control needs a
  // disable comment saying why no primitive fits. Brand sites (site/, brand-sections/) draw the brand's own.
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: ["src/components/ui/**", "src/components/site/**", "src/components/brand-sections/**", "**/*.stories.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXOpeningElement[name.name='button']", message: "Use Button or IconButton (components/ui, components/icon-button), or say why not in a disable comment." },
        { selector: "JSXOpeningElement[name.name=/^(select|textarea)$/]", message: "Use Select or Textarea (components/ui), or say why not in a disable comment." },
        {
          // Hidden, file, range and color inputs have no primitive: a form value, a file picker, a slider, the system color picker.
          selector: "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'][value.value=/^(hidden|file|range|color)$/]))",
          message: "Use Input, Checkbox, Switch or RadioGroup (components/ui), or say why not in a disable comment.",
        },
      ],
    },
  },
];

export default config;
