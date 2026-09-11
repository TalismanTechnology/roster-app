import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ROSTER_NEXT_OUTPUT || ".next",
  experimental: { proxyClientMaxBodySize: "11mb" },
  // Pin the workspace root. Without it Turbopack walks up and finds the
  // stray package-lock.json in the home directory, then warns on every build.
  turbopack: {
    root: __dirname,
  },

  images: {
    remotePatterns: [
      // Avatars and cover images are served from Supabase Storage.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" },
      // Film posters. Listed by exact host: an athlete controls the clip URL,
      // and the provider id parsed from it becomes part of this path, so a
      // wildcard here would let a crafted URL point the optimizer anywhere.
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
