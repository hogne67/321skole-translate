import type { NextRequest } from "next/server";
import { familyError, familyJson } from "@/lib/familyDevice.server";
import { readFamilyAssignment, saveFamilyAssignment } from "@/lib/familyWork.server";

type Context = { params: Promise<{ spaceId: string; assignmentId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
    try {
        const { spaceId, assignmentId } = await params;
        const { view } = await readFamilyAssignment(req, spaceId, assignmentId);
        return familyJson(view);
    } catch (error) {
        return familyError(error);
    }
}

export async function POST(req: NextRequest, { params }: Context) {
    try {
        const { spaceId, assignmentId } = await params;
        await saveFamilyAssignment(req, spaceId, assignmentId);
        const { view } = await readFamilyAssignment(req, spaceId, assignmentId);
        return familyJson(view);
    } catch (error) {
        return familyError(error);
    }
}
