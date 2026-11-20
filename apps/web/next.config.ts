import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const cloudflareStatic = process.env.CLOUDFLARE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(cloudflareStatic ? { output: "export" as const } : {}),
  allowedDevOrigins: [
    "meotdc.localhost",
    "student.meotdc.localhost",
    "teacher.meotdc.localhost",
    "school.meotdc.localhost",
    "admin.meotdc.localhost",
  ],
  ...(!cloudflareStatic ? {
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
    },
    async headers() {
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      }];
    },
  } : {}),
};

export default nextConfig;
