import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

import { Button } from "./Button";
import { trapDialogTab } from "@/lib/dialogKeyboard";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  placement?: "center" | "drawer";
}

/**
 * Native <dialog> gives focus trapping, Esc-to-close and focus return for free (docs/07 §12).
 * Clicking the backdrop also closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement = "center",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onKeyDown={trapDialogTab}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`glass-strong overflow-y-auto p-0 text-text open:animate-scale-in ${placement === "drawer" ? "fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(20rem,calc(100%-2rem))] rounded-r-2xl" : "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl"}`}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-2 -mt-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {description && (
            <div id={descId} className="mt-2 text-sm leading-relaxed text-muted">
              {description}
            </div>
          )}
          {children && <div className="mt-5">{children}</div>}
          {footer && (
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  isLoading?: boolean;
}

/** docs/07 §6 — destructive actions always go through an explicit confirmation. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = "danger",
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
