import { familyError, familyJson } from "@/lib/familyDevice.server";
import { readParentFollowUp } from "@/lib/familyWork.server";

export async function GET(req: Request) {
    try {
        return familyJson(await readParentFollowUp(req));
    } catch (error) {
        return familyError(error);
    }
}
