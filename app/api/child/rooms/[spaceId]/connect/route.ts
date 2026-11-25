import type { NextRequest } from "next/server";
import { connectFamilyDevice, familyError } from "@/lib/familyDevice.server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ spaceId: string }> }) {
    try {
        const { spaceId } = await params;
        return await connectFamilyDevice(req, spaceId);
    } catch (error) {
        return familyError(error);
    }
}
