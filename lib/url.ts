// lib\url.ts
export function getOrigin() {
    if (typeof window !== "undefined") {
        return window.location.origin;
    }

    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}