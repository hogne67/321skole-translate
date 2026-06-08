import type { Metadata } from "next";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string; spaceId: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale, spaceId } = await params;

  return {
    manifest: `/${locale}/child/spaces/${encodeURIComponent(spaceId)}/manifest.webmanifest`,
  };
}

export default function ChildSpaceLayout({ children }: Props) {
  return children;
}
