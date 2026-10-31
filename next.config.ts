import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir:
    process.env.NODE_ENV === "development" &&
    /^\.next(?:-[a-z0-9-]+)?$/.test(process.env.PORTAL_DIST_DIR || "")
      ? process.env.PORTAL_DIST_DIR
      : ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default withWorkflow(nextConfig);
