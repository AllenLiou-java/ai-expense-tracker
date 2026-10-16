"use client";

import { useEffect, type ReactNode } from "react";

/** Bottom sheet shell: backdrop, Escape to close, and no page scroll behind it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30">
      <button aria-label="關閉" onClick={onClose} className="absolute inset-0 bg-black/35 animate-fade" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-t-[28px] border-t border-line bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.12)] animate-sheet"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        {children}
      </div>
    </div>
  );
}
