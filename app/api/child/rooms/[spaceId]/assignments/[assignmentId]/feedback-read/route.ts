import type { NextRequest } from "next/server";
import { familyError, familyJson } from "@/lib/familyDevice.server";
import { markFamilyFeedbackRead } from "@/lib/familyWork.server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ spaceId: string; assignmentId: string }> }) {
    try {
        const { spaceId, assignmentId } = await params;
        await markFamilyFeedbackRead(req, spaceId, assignmentId);
        return familyJson({ ok: true });
    } catch (error) {
        return familyError(error);
    }
}
