"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * ── Why 520 rather than the DS's 440 ────────────────────────────────────────
 * The design system's Dialog (v3) spec
 * (`.skills/advantage-analytics-design/reference/chrome.md` § Dialog) gives
 * form dialogs `w-[440px]` and reserves `w-[520px]`
 * for compare dialogs. The roster's forms carry more rows than the v3 form
 * dialog anticipates, so this shell now defaults to the DS's own compare-
 * dialog width instead of inventing a new number.
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
  width = 520,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Usually a sentence; the Edit Match dialog puts its event line and one link here. */
  description: React.ReactNode;
  /** 520 for add, invite, edit and merge; 480 for review requests; 440 kept for a narrower future case. */
  width?: 440 | 480 | 520 | 560;
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

// Moved to `ui/` so `ConfirmDialog` can share it; re-exported for the roster dialogs.
export { DialogProblem } from "@/components/ui/dialog-problem";

/**
 * The program's seats as unit boxes — the design system's form for a small
 * countable quota: 8px squares on a 2px radius (circles are for people).
 * Filled = a player on the roster, outlined = held by an open invitation,
 * light blue = what the action in front of the coach would take, grey = free.
 * `full` paints every box `--danger`: at the cap the boxes ARE the message,
 * and severity rides the fill, never the figure alone.
 */
export function SeatBoxes({
  seats,
  adding = 0,
  full = false,
}: {
  seats: { seats: number; used: number; pending: number };
  /** Boxes the pending action would take, drawn light blue after the held ones. */
  adding?: number;
  full?: boolean;
}) {
  const total = Math.max(seats.seats, seats.used + seats.pending);
  return (
    <span className="flex flex-wrap gap-[3px]" aria-hidden>
      {Array.from({ length: total }, (_, index) => {
        const kind = full
          ? "full"
          : index < seats.used
            ? "used"
            : index < seats.used + seats.pending
              ? "held"
              : index < seats.used + seats.pending + adding
                ? "adding"
                : "free";
        return (
          <span
            key={index}
            className={cn(
              "size-2 rounded-[2px]",
              kind === "full" && "bg-[var(--danger)]",
              kind === "used" && "bg-[var(--blue)]",
              kind === "held" && "shadow-[inset_0_0_0_1px_var(--blue)]",
              // The seat this action takes: the next square, in a lighter
              // step of the same blue — "one more of these", read without a key.
              kind === "adding" && "bg-[var(--blue)] opacity-40",
              kind === "free" && "bg-[var(--ink-100)]",
            )}
          />
        );
      })}
    </span>
  );
}

/**
 * The seat note — Roster canvas frames 2B/2C. Stacked, never one run-on
 * sentence: a bold lead that answers "does this cost a seat?", the reason,
 * then the seat boxes with the ledger beside them as a machine readout
 * (Roboto Mono — a quota readout, not a stat), and an optional grey footnote.
 */
export function SeatNote({
  icon,
  lead,
  children,
  seats,
  adding = 0,
  footnote,
}: {
  icon: React.ReactNode;
  lead: React.ReactNode;
  children?: React.ReactNode;
  seats: { seats: number; used: number; pending: number };
  /** Seats this action takes: 0 for a claim, 1+ for an add or invitation. */
  adding?: number;
  footnote?: React.ReactNode;
}) {
  const taken = seats.used + seats.pending;
  const readout =
    adding > 0
      ? `${taken} → ${taken + adding} / ${seats.seats}`
      : `${taken} / ${seats.seats}`;
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
      <span className="mt-0.5 shrink-0 text-[var(--ink-600)]">{icon}</span>
      <span className="flex min-w-0 flex-col gap-2.5 text-[11px] leading-[1.6]">
        <span className="text-[var(--ink-700)]">
          <strong className="font-medium text-[var(--ink-900)]">{lead}</strong>
          {children && <> {children}</>}
        </span>
        <span className="flex items-center gap-2.5">
          <SeatBoxes seats={seats} adding={adding} />
          <span
            className="font-mono whitespace-nowrap text-[var(--ink-700)] tabular-nums"
            aria-label={`${taken} of ${seats.seats} seats taken${adding > 0 ? `, ${taken + adding} after this` : ""}`}
          >
            {readout}
          </span>
        </span>
        {footnote && <span className="text-[var(--ink-500)]">{footnote}</span>}
      </span>
    </div>
  );
}
