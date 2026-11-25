import type { NextRequest } from "next/server";
import { familyError, familyJson } from "@/lib/familyDevice.server";
import { readFamilyRoom } from "@/lib/familyWork.server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ spaceId: string }> }) {
    try {
        const { spaceId } = await params;
        return familyJson(await readFamilyRoom(req, spaceId));
    } catch (error) {
        return familyError(error);
    }
}
