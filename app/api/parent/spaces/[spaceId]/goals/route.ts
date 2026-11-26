import type { NextRequest } from "next/server";
import { familyError, familyJson } from "@/lib/familyDevice.server";
import { createFamilyGoal, markFamilyRewardGiven, readParentFamilyGoals } from "@/lib/familyWork.server";

type Context = { params: Promise<{ spaceId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
    try {
        const { spaceId } = await params;
        return familyJson(await readParentFamilyGoals(req, spaceId));
    } catch (error) {
        return familyError(error);
    }
}

export async function POST(req: NextRequest, { params }: Context) {
    try {
        const { spaceId } = await params;
        return familyJson(await createFamilyGoal(req, spaceId), 201);
    } catch (error) {
        return familyError(error);
    }
}

export async function PATCH(req: NextRequest, { params }: Context) {
    try {
        const { spaceId } = await params;
        return familyJson(await markFamilyRewardGiven(req, spaceId));
    } catch (error) {
        return familyError(error);
    }
}
