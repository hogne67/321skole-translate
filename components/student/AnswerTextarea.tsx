"use client";

import { useId, useState, type TextareaHTMLAttributes } from "react";
import { useLocale } from "next-intl";
import { answerPasteCopy } from "@/lib/lessons/answerPaste";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { allowPaste?: boolean };

export default function AnswerTextarea({
  allowPaste = false, onPaste, onDrop, onBeforeInput, onChange,
  "aria-describedby": describedBy, ...props
}: Props) {
  const copy = answerPasteCopy(useLocale());
  const noticeId = useId();
  const [showNotice, setShowNotice] = useState(false);
  const noticeVisible = !allowPaste && showNotice;

  function block(event: { preventDefault: () => void }) {
    event.preventDefault();
    setShowNotice(true);
  }

  return (
    <>
      <textarea {...props}
        aria-describedby={[describedBy, noticeVisible ? noticeId : null].filter(Boolean).join(" ") || undefined}
        onPaste={event => {
          if (!allowPaste) { block(event); return; }
          onPaste?.(event);
        }}
        onDrop={event => {
          if (!allowPaste && event.dataTransfer.types.some(type => type.startsWith("text/"))) { block(event); return; }
          onDrop?.(event);
        }}
        onBeforeInput={event => {
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (!allowPaste && (inputType === "insertFromPaste" || inputType === "insertFromDrop")) { block(event); return; }
          onBeforeInput?.(event);
        }}
        onChange={event => {
          setShowNotice(false);
          onChange?.(event);
        }}
      />
      {noticeVisible ? (
        <p id={noticeId} role="status" style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          {copy.blocked}
        </p>
      ) : null}
    </>
  );
}
