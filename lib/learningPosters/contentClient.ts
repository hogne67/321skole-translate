"use client";
import { auth } from "../firebase";
import { posterContentItem, type PosterContentSummary } from "./content";

export async function fetchPosterContentItems(uid: string, locale: string) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || user.uid !== uid) throw new Error("unauthorized");
  const token = await user.getIdToken();
  const response = await fetch(`/api/producer/learning-posters?content=1&locale=${encodeURIComponent(locale)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok || auth.currentUser?.uid !== uid) throw new Error("poster_content_unavailable");
  const data = await response.json() as { ok: boolean; posters: PosterContentSummary[] };
  if (!data.ok || !Array.isArray(data.posters)) throw new Error("poster_content_unavailable");
  return data.posters.map(poster => posterContentItem(poster, locale));
}
