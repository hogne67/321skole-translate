import type { NextRequest } from "next/server";
import { familyError, manageFamilyDevice } from "@/lib/familyDevice.server";

type Context = { params: Promise<{ spaceId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
    try {
        const { spaceId } = await params;
        return await manageFamilyDevice(req, spaceId);
    } catch (error) {
        return familyError(error);
    }
}

export const POST = GET;
