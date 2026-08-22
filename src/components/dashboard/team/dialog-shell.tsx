"use client";

import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * The shell the roster's dialogs share.
 *
 * Three of them — Add player, Invite, Merge profiles — are the same object at
 * two widths, and they were going to be three hand-built copies of the same
 * header, spacing and footer. This is that structure once.
 *
 * ── Why not `DialogHeader` / `DialogFooter` ─────────────────────────────────
 * Nothing in this app uses them; they are near-empty flex divs and every real
 * consumer builds its own. Following the tree rather than the primitive.
 *
 * ── Why its own close button ────────────────────────────────────────────────
 * `DialogContent`'s default X is the stock shadcn one — `right-4 top-4`, a 16px
 * glyph, no hit area. The design system's Chrome Icon Button is 28px with a
 * 14px glyph at `strokeWidth 1.5` and a `--surface-subtle` hover, and it says
 * the X on a modal must look like the X everywhere else. Fixing the shared
 * primitive would improve every dialog in the product and is worth doing — but
 * it touches all of them, so it is its own change, not a rider on this one.
 *
 * `DialogContent`'s base class is `grid gap-4`, which would space these
 * children on a fixed 16px rhythm. The single flex column below takes that back
 * so the 18px rhythm the design draws is the one that renders.
 */
export function RosterDialog({
  open,
  onOpenChange,
  title,
  description,
  width = 440,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** 440 for the invite and add dialogs, 520 for merge. */
  width?: 440 | 520;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: `${width}px`,
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                {description}
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {children}

          <div className="flex items-center gap-2.5 pt-0.5">{footer}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The tinted note these dialogs end on — what an action costs, or what it
 * leaves alone. An icon and a sentence on `--surface-subtle`.
 */
export function DialogInfoRow({
  icon,
  children,
  tone = "subtle",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  /** "blue" for the tripwire, which is proposing something rather than stating it. */
  tone?: "subtle" | "blue";
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-[var(--radius-element)] px-3 py-2.5"
      style={{
        background:
          tone === "blue" ? "var(--blue-tint-08)" : "var(--surface-subtle)",
      }}
    >
      <span className="mt-px shrink-0 text-[var(--ink-600)]">{icon}</span>
      <span className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
        {children}
      </span>
    </div>
  );
}

/** The error these dialogs show, in the shape the rest of the app uses. */
export function DialogProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-button)] px-3 py-2 text-[12px] text-[var(--danger)]"
      style={{ background: "var(--danger-tint, rgba(229,24,55,0.08))" }}
    >
      {message}
    </p>
  );
}
