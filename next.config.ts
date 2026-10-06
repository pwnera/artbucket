import type { NextConfig } from "next";

const config: NextConfig = {
  // The Docker image runs the traced server alone (Dockerfile); `pnpm start` runs the usual build.
  ...(process.env.STANDALONE === "1" && { output: "standalone" as const }),
  // exifreader loads @xmldom/xmldom (its optional XMP parser) with a runtime
  // require that bundling drops, which silently loses every XMP field.
  // mupdf and libheif (heic-decode) load their WebAssembly from their own package directory; they and ag-psd
  // run in a child process that imports them by name (lib/core/previews.ts), so the standalone build ships them whole.
  // playwright-core drives the server's Chromium (lib/core/print.ts) and is not for bundling.
  serverExternalPackages: ["sharp", "exifreader", "mupdf", "heic-decode", "ag-psd", "playwright-core"],
  // It reads files like browsers.json by computed path, which tracing cannot see: the standalone image needs all of it.
  // The previews' child process imports mupdf by its name, which the build only links under one of its own.
  outputFileTracingIncludes: { "/api/**/*": ["./node_modules/playwright-core/**/*", "./node_modules/mupdf/**/*"] },
  // The dev badge sits bottom-left by default, on top of the sidebar's footer.
  devIndicators: { position: "bottom-right" },
  // OAuth discovery (lib/core/oauth.ts). The path after either one names the resource or issuer; there is one of each.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/v1/oauth/server" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/v1/oauth/resource" },
    ];
  },
  // The rest, which depend on the server's configuration (CSP, HSTS), are set per request in src/proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
