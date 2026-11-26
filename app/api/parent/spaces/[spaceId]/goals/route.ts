import type { NextRequest } from "next/server";
import { familyError, familyJson } from "@/lib/familyDevice.server";
import { createFamilyGoal } from "@/lib/familyWork.server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ spaceId: string }> }) {
    try {
        const { spaceId } = await params;
        return familyJson(await createFamilyGoal(req, spaceId), 201);
    } catch (error) {
        return familyError(error);
    }
}
