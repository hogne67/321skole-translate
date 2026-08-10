type Props = {
  params: Promise<{ locale: string; spaceId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { locale, spaceId } = await params;
  const encodedSpaceId = encodeURIComponent(spaceId);
  const startUrl = `/${locale}/child/spaces/${encodedSpaceId}`;

  return Response.json({
    name: "321 Skole barnerom",
    short_name: "Barnerom",
    description: "321 Skole barnerom og oppgaver.",
    id: `/321skole-child/${encodedSpaceId}`,
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/pwa-child-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  }, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
