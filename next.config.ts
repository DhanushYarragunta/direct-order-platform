import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  typescript: {
    // The dev server regenerates its route files while a production build runs.
    tsconfigPath: process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json",
  },
  poweredByHeader: false,
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
