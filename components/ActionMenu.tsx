// components/ActionMenu.tsx
// components/ActionMenu.tsx
"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ActionItem = {
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void | Promise<void>;
};

type ActionMenuProps = {
  items: ActionItem[];
  align?: "left" | "right";
};

type MenuPos = {
  top: number;
  left: number;
};

export default function ActionMenu({
  items,
  align = "right",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos>({ top: 0, left: 0 });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hasEnabled = items.some((x) => !x.disabled);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      const insideButton = !!buttonRef.current?.contains(target);
      const insideMenu = !!menuRef.current?.contains(target);

      if (!insideButton && !insideMenu) {
        setOpen(false);
      }
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("mousedown", onDocPointer);
    window.addEventListener("keydown", onEsc);

    return () => {
      window.removeEventListener("mousedown", onDocPointer);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function updatePosition() {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const estimatedWidth = 240;
    const viewportWidth = window.innerWidth;

    let left =
      align === "left"
        ? rect.left
        : rect.right - estimatedWidth;

    left = Math.max(12, Math.min(left, viewportWidth - estimatedWidth - 12));

    const top = rect.bottom + margin;

    setMenuPos({
      top,
      left,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    function handleReposition() {
      updatePosition();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, align]);

  if (!items.length) return null;

  return (
    <div
      ref={rootRef}
      className="relative inline-block overflow-visible"
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!hasEnabled) return;
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        disabled={!hasEnabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        className={[
          "inline-flex h-14 w-14 items-center justify-center rounded-2xl",
          "border-2 border-zinc-900 bg-zinc-900 text-white shadow-lg",
          "text-[28px] font-black leading-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        ].join(" ")}
      >
        ≡
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[99999] min-w-[220px] max-w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
              style={{
                top: menuPos.top,
                left: menuPos.left,
              }}
            >
              {items.map((it, index) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  disabled={!!it.disabled}
                  onClick={async () => {
                    if (it.disabled) return;
                    setOpen(false);
                    await it.onClick();
                  }}
                  className={[
                    "block w-full px-4 py-3 text-left text-[15px] font-extrabold",
                    "bg-white text-zinc-900",
                    "hover:bg-zinc-100",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    it.danger ? "text-red-600 hover:bg-red-50" : "",
                    index !== items.length - 1 ? "border-b border-black/5" : "",
                  ].join(" ")}
                >
                  {it.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}