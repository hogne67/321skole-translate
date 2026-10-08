// next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["oidc-provider"],
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server/api/oauth", destination: "/api/oauth/.well-known/oauth-authorization-server" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/.well-known/oauth-authorization-server" },
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: "/.well-known/oauth-protected-resource" },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/**",
      },
    ],
  },

  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "321skole.no",
          },
        ],
        destination: "https://321school.com/nb",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.321skole.no",
          },
        ],
        destination: "https://321school.com/nb",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
