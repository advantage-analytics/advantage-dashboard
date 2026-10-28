"use client";

import { X } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The Dialog (v3) form shell the two Pilots dialogs share — 440px, 24/24/20
 * padding, 18px between fields, a 16px/500 title over one 12px ink-600
 * contract sentence, a 28px close, and the footer grammar: an optional quiet
 * blue text action left, Cancel + one primary right.
 */
export function PilotDialog({
  open,
  onOpenChange,
  pending,
  title,
  description,
  problem,
  footerLeft,
  submitLabel,
  pendingLabel,
  canSubmit,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Holds Cancel, the X and Esc while a write is in flight. */
  pending: boolean;
  title: string;
  description: React.ReactNode;
  problem: string | null;
  footerLeft?: React.ReactNode;
  submitLabel: string;
  pendingLabel: string;
  canSubmit: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const close = () => {
    if (!pending) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "440px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <form
          className="flex flex-col gap-[18px] p-6 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !pending) onSubmit();
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                {description}
              </DialogDescription>
            </div>
            <ChromeTooltip label="Close">
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                disabled={pending}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </ChromeTooltip>
          </div>

          {children}

          <DialogProblem message={problem} />

          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="flex-1">{footerLeft}</div>
            <button
              type="button"
              className={advButton("ghost", "md")}
              onClick={close}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={advButton("primary", "md")}
              disabled={!canSubmit || pending}
            >
              {pending ? pendingLabel : submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The quiet blue text action a dialog footer may carry on its left. */
export function FooterTextAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-[var(--radius-element)] text-[12px] text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-[var(--ink-400)]"
    >
      {children}
    </button>
  );
}
