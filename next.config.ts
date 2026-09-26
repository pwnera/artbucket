import type { NextConfig } from "next";

const config: NextConfig = {
  // exifreader loads @xmldom/xmldom (its optional XMP parser) with a runtime
  // require that bundling drops, which silently loses every XMP field.
  serverExternalPackages: ["sharp", "exifreader"],
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
