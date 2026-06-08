type Props = {
  params: Promise<{ locale: string }>;
};

const SUPPORTED_LOCALES = new Set(["en", "nb", "pt"]);

export async function GET(_request: Request, { params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = SUPPORTED_LOCALES.has(rawLocale) ? rawLocale : "nb";

  return Response.json({
    name: "321 Skole",
    short_name: "321 Skole",
    description: "321 Skole læringsplattform.",
    id: "/321skole-app",
    start_url: `/${locale}/post-login`,
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  }, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
