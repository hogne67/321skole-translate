// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // ✅ Viktig for Firebase signInWithPopup (hindrer COOP-problemet du ser i console)
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },

          // (Valgfritt) Hvis du tidligere har satt COEP et annet sted og vil “nøytralisere”:
          // { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

export default nextConfig;
