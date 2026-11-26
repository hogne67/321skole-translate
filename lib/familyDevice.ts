import type { AssignmentDoc, ParentReviewDoc, SubmissionDoc } from "./familyAssignments";
import type { FamilyGoalProgress } from "./parentGoals";

export const FAMILY_INVITE_MINUTES = 30;
export const FAMILY_DEVICE_DAYS = 90;
export const FAMILY_DEVICE_LIMIT = 12;
export const FAMILY_DEVICE_NAME_MAX_LENGTH = 40;
export const FAMILY_LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const CHILD_START_URL_KEY = "321skole.childStartUrl";

export type FamilyDevice = { id: string; createdAt: number; expiresAt: number; name?: string };
export type FamilyDeviceStatus = { inviteExpiresAt: number | null; inviteName?: string; devices: FamilyDevice[] };
export type FamilyRoomSummary = { title?: string; activeLessonId?: string; activeGoalId?: string };
export type FamilyRoomData = {
    room: FamilyRoomSummary;
    device: { number: number; name?: string };
    goals: FamilyGoalProgress[];
    assignments: Array<{
        id: string;
        data: AssignmentDoc & { updatedAt: number; createdAt: number };
        progress: {
            status: string | null;
            hasAiFeedback: boolean;
            autoSummary: string | null;
            updatedAtMillis: number;
        };
        hasParentFeedback: boolean;
        unreadFeedbackAt: number | null;
    }>;
};

export type FamilyAssignmentData = {
    room: FamilyRoomSummary;
    assignment: AssignmentDoc;
    submission: SubmissionDoc | null;
    parentReview: ParentReviewDoc | null;
    unreadFeedbackRevision: string | null;
    revision: string | null;
};

export const FAMILY_GREETING_ID = "parent-greeting";
export const CHILD_PREVIEW_PARAM = "preview";

export function childRoomHref(spaceId: string, assignmentId?: string, preview = false) {
    const room = "/child/spaces/" + encodeURIComponent(spaceId);
    const path = assignmentId ? room + "/assignments/" + encodeURIComponent(assignmentId) : room;
    return preview ? path + "?" + CHILD_PREVIEW_PARAM + "=parent" : path;
}

export function familyDeviceApi(spaceId: string) {
    return "/api/child/rooms/" + encodeURIComponent(spaceId);
}

export function rememberChildRoom() {
    try {
        window.localStorage.setItem(CHILD_START_URL_KEY, window.location.pathname);
    } catch {
        // The device session works even when local storage is unavailable.
    }
}
