import { Timestamp } from "firebase/firestore";

export async function getOwnSubmissions(source: "submissions" | "spaceSubmissions", uid: string, maxDocs?: number) {
  const { auth } = await import("@/lib/firebase");
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Unauthorized");
  const response = await fetch(`/api/student/submissions?source=${source}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load submissions");
  const payload = JSON.parse(await response.text(), (_key, value) => {
    if (value && typeof value === "object" && typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
      return new Timestamp(value.seconds, value.nanoseconds);
    }
    return value;
  }) as { documents: Array<{ id: string; data: Record<string, unknown> }> };
  const millis = (data: Record<string, unknown>) => {
    const time = data.updatedAt ?? data.createdAt;
    return time instanceof Timestamp ? time.toMillis() : typeof time === "string" ? Date.parse(time) || 0 : 0;
  };
  const docs = payload.documents.sort((a, b) => millis(b.data) - millis(a.data)).slice(0, maxDocs)
    .map(doc => ({ id: doc.id, data: () => doc.data }));
  return { docs, forEach: (fn: (doc: (typeof docs)[number]) => void) => docs.forEach(fn) };
}
