import { useEffect, type ReactNode } from "react";
import { cn } from "#/lib/utils";

/** Minimal modal - overlay + Escape + click-outside. No extra deps. */
export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
