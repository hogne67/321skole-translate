import type { Metadata } from "next";
import ChildDeviceConnect from "@/components/child/ChildDeviceConnect";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConnectPage({ params }: { params: Promise<{ spaceId: string }> }) {
    const { spaceId } = await params;
    return <ChildDeviceConnect spaceId={spaceId} />;
}
