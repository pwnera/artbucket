import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  // pnpm's strict layout hides react from the plugin's auto-detection.
  { settings: { react: { version: "19.3" } } },
];

export default config;
