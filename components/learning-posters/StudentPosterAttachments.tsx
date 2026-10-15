"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { browserSourceFingerprint, readPosterAttachments, type PosterAttachment } from "@/lib/learningPosters/attachments";
import { posterCopy } from "@/lib/learningPosters/copy";

export function PosterAttachmentLinks({ attachments }: { attachments: PosterAttachment[] }) {
  const locale = useLocale(); const copy = posterCopy(locale);
  if (!attachments.length) return null;
  return <aside aria-label={copy.studentAttachments} style={{ margin: "12px 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
    <span style={{ fontSize: 13, color: "#475569" }}>{copy.studentAttachments}:</span>
    {attachments.map(attachment => <a key={attachment.posterId} href={attachment.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", border: "1px solid #bae6fd", borderRadius: 10, background: "#f0f9ff", padding: "9px 12px", color: "#075985", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
      {copy.openStudentPoster}: {attachment.title}<span style={{ display: "block", fontSize: 12, fontWeight: 400 }}>{copy.purposes[attachment.purpose]}</span>
    </a>)}
  </aside>;
}
export default function StudentPosterAttachments({ attachments, sourceText }: { attachments: unknown; sourceText: string }) {
  const [verified, setVerified] = useState<{ value: unknown; text: string; items: PosterAttachment[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const items = readPosterAttachments(attachments);
    if (items.length) void browserSourceFingerprint(sourceText).then(hash => {
      if (!cancelled) setVerified({ value: attachments, text: sourceText, items: items.filter(item => item.sourceHash === hash) });
    }).catch(() => { /* Hide attachments if source consistency cannot be checked. */ });
    return () => { cancelled = true; };
  }, [attachments, sourceText]);
  return verified && verified.value === attachments && verified.text === sourceText ? <PosterAttachmentLinks attachments={verified.items} /> : null;
}
