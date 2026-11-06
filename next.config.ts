import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * The production deploy, as opposed to a preview build or a local
 * `next start`. Vercel says which; anywhere else, only an explicit
 * ROSTER_DEPLOY=production opts in. HSTS `preload` is a promise about the
 * whole registrable domain that takes months to undo, so it must never ride
 * along on a preview host.
 */
const isProductionDeploy = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.ROSTER_DEPLOY === "production";

/**
 * A static policy rather than a nonce: nonces force every page to render
 * dynamically, and much of the site is prerendered. Inline `<script>` stays
 * allowed because Next's bootstrap is inline on static pages; everything
 * else is pinned to the hosts the app actually talks to.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Style attributes (layout tokens, motion) cannot carry a nonce.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws:" : ""}`,
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isProductionDeploy ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Strict-Transport-Security",
            value: isProductionDeploy ? "max-age=63072000; includeSubDomains; preload" : "max-age=31536000",
          },
        ],
      },
      {
        // The token in this URL is the whole credential. Never hand it to
        // the next site in a Referer — not even the origin of it.
        source: "/verify/:token*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // Same for a local password-reset link: ?token= is the credential.
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
