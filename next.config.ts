import type { NextConfig } from "next";

const config: NextConfig = {
  // exifreader loads @xmldom/xmldom (its optional XMP parser) with a runtime
  // require that bundling drops, which silently loses every XMP field.
  // mupdf and libheif (heic-decode) load their WebAssembly from their own package directory.
  serverExternalPackages: ["sharp", "exifreader", "mupdf", "heic-decode"],
  // The dev badge sits bottom-left by default, on top of the sidebar's footer.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
