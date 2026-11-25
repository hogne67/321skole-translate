import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import ChildRoomAccess from "@/components/child/ChildRoomAccess";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string; spaceId: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale, spaceId } = await params;

  return {
    manifest: `/${locale}/child/spaces/${encodeURIComponent(spaceId)}/manifest.webmanifest`,
    robots: { index: false, follow: false },
  };
}

export default async function ChildSpaceLayout({ children, params }: Props) {
  const { spaceId } = await params;
  return <Suspense><ChildRoomAccess key={spaceId} spaceId={spaceId}>{children}</ChildRoomAccess></Suspense>;
}
