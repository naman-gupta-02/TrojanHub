import type { NextConfig } from "next";

// One-URL hosting (Replit): the website forwards /api/* and /health to the AI service running
// next to it, e.g. API_PROXY_TARGET=http://127.0.0.1:8000, and the browser uses
// NEXT_PUBLIC_API_URL=/ (same origin, so no CORS). Unset locally: nothing changes.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
    ];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
