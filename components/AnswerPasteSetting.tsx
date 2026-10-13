"use client";

import { useId } from "react";
import { useLocale } from "next-intl";
import { answerPasteCopy } from "@/lib/lessons/answerPaste";
import styles from "./AnswerPasteSetting.module.css";

export default function AnswerPasteSetting({ allowed, onChange, disabled = false }: {
  allowed: boolean;
  onChange: (allowed: boolean) => void;
  disabled?: boolean;
}) {
  const copy = answerPasteCopy(useLocale());
  const groupId = useId();
  const options = [
    { value: false, label: copy.disallowed, help: copy.disallowedHelp },
    { value: true, label: copy.allowed, help: copy.allowedHelp },
  ];
  return (
    <fieldset className={styles.setting} disabled={disabled}>
      <legend className={styles.heading}>{copy.heading}</legend>
      <div className={styles.options}>
        {options.map(option => {
          const selected = allowed === option.value;
          const helpId = `${groupId}-${option.value}-help`;
          return (
            <label key={String(option.value)} className={styles.option} data-selected={selected}>
              <input className={styles.input} type="radio" name={groupId}
                value={String(option.value)} checked={selected}
                aria-describedby={helpId} onChange={() => onChange(option.value)} />
              <span className={styles.indicator} aria-hidden="true">
                {selected && <span className={styles.dot} />}
              </span>
              <span className={styles.content}>
                <span className={styles.label}>
                  {option.label}
                  {!option.value && <span className={styles.badge}>{copy.defaultLabel}</span>}
                </span>
                <span id={helpId} className={styles.help}>{option.help}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
