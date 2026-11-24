type StudentContentOrigin = "content" | "content-room";

export function getStudentContentOrigin(params: Pick<URLSearchParams, "get">): StudentContentOrigin | null {
  const from = params.get("from");
  return from === "content" || from === "content-room" ? from : null;
}

export function getStudentContentReturnHref(from: StudentContentOrigin | null, spaceId: string) {
  if (!from) return null;
  return from === "content-room" ? `/content?room=${encodeURIComponent(spaceId)}` : "/content";
}
