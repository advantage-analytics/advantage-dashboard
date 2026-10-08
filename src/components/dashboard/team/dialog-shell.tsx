"use client";

import { Check, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SeatUsage } from "@/lib/data/team-roster-server";
import { useDescribedBody } from "@/hooks/use-described-body";

/**
 * Deliberately loose. The database and the mail server are the real checks.
 *
 * Shared by the Roster's invite dialog and the staff invite in Settings ›
 * Teams so the two don't drift on what counts as "looks like an email".
 */
export const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  describedBodyId,
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
  /**
   * The id of the confirm's consequence prose, while one is showing. It joins
   * the description a screen reader announces on open; a form body never
   * should, so this is opt-in rather than the whole of `children`.
   */
  describedBodyId?: string;
}) {
  const { descriptionRef, contentProps } = useDescribedBody(describedBodyId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...contentProps}
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: `${width}px`,
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        {/* `min-w-0`: this column is the dialog grid's one item, and a grid
            item is never narrower than its content. One unbreakable line — a
            join link's URL — would otherwise widen the column past the
            dialog and push everything in it out of the right edge. */}
        <div className="flex min-w-0 flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                {title}
              </DialogTitle>
              <DialogDescription
                ref={descriptionRef}
                className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]"
              >
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
 * One grammar: outline = not spent, solid = spent. A grey (`--ink-400`)
 * hairline is a free seat; a dashed blue outline is one held by an open
 * invitation — dashed like the invited avatar's ring, so it reads apart from a
 * free seat without colour. Solid blue is a player on the roster, 40%-opacity solid blue
 * is what the action in front of the coach would take. `full` paints every
 * box `--danger`: at the cap the boxes ARE the message, and severity rides
 * the fill, never the figure alone.
 */
export function SeatBoxes({
  seats,
  adding = 0,
  full = false,
  grouped = false,
}: {
  seats: SeatUsage;
  /** Boxes the pending action would take, drawn light blue after the held ones. */
  adding?: number;
  full?: boolean;
  /**
   * Set the squares in fives, a wider gap after each fifth. Where the row has
   * room to run on one line (the seat note), 25 undivided squares are a bar to
   * be counted; five blocks of five are read. Off where the squares wrap in a
   * narrow column, which already breaks them into rows.
   */
  grouped?: boolean;
}) {
  const total = Math.max(seats.seats, seats.used + seats.pending);
  const boxes = Array.from({ length: total }, (_, index) => {
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
          // Dashed, like the invited avatar's ring: an invitation reads
          // apart from a free seat without relying on colour.
          kind === "held" && "border border-dashed border-[var(--blue)]",
          // The seat this action takes: the next square, in a lighter
          // step of the same blue — "one more of these", read without a key.
          kind === "adding" && "bg-[var(--blue)] opacity-40",
          // ink-400: ink-300 all but vanished on the note's surface-subtle.
          kind === "free" && "shadow-[inset_0_0_0_1px_var(--ink-400)]",
        )}
      />
    );
  });

  if (!grouped) {
    return (
      <span className="flex flex-wrap gap-[3px]" aria-hidden>
        {boxes}
      </span>
    );
  }

  const groups: React.ReactNode[][] = [];
  for (let i = 0; i < boxes.length; i += 5) groups.push(boxes.slice(i, i + 5));
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-[3px]" aria-hidden>
      {groups.map((group, index) => (
        <span key={index} className="flex gap-[3px]">
          {group}
        </span>
      ))}
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
  seats: SeatUsage;
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
          <SeatBoxes seats={seats} adding={adding} grouped />
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

/**
 * The role choice in an invite dialog: a labelled radiogroup whose options
 * sit side by side as tiles. Stacked full-width, three cards made the dialog
 * the height of a form page for what is one pick among a few words; a row
 * reads as the set it is, and on a phone it falls back to a stack.
 *
 * Shared by the Roster's invite dialog and the staff invite in Settings ›
 * Teams, so both surfaces offer a role the same way.
 */
export function RoleChoice({
  columns,
  layout = "row",
  children,
}: {
  /** One per option drawn, so the tiles share the row evenly. */
  columns: 2 | 3;
  /**
   * `stack` sets the cards one per row at every width. The Roster's invite
   * dialog takes it (design owner's pick, 2026-10-08): beside the join link's
   * stacked "Who can join" list, a row of tiles made the two halves of one
   * dialog offer a choice two different ways. The staff invite keeps the row.
   */
  layout?: "row" | "stack";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-[var(--ink-600)]">Role</span>
      <div
        role="radiogroup"
        aria-label="Role"
        data-layout={layout}
        className={cn(
          "group/roles grid grid-cols-1 gap-1.5",
          layout === "row" &&
            (columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"),
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One role option inside `RoleChoice` — the DS `Radio` in its card variant:
 * the check-dot beside the title, a short line on what the role can do under
 * it, and selection shown as a `--blue` border on the `--blue-tint-08` wash.
 */
export function RoleCard({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex h-full cursor-pointer flex-col gap-1 rounded-[var(--radius-element)] border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        checked
          ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
          : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full",
            checked ? "bg-[var(--blue)]" : "border border-[var(--ink-300)]",
          )}
        >
          {checked && (
            <Check className="size-2 text-white" strokeWidth={3} aria-hidden />
          )}
        </span>
        <span className="text-[12px] font-medium text-[var(--ink-900)]">
          {title}
        </span>
      </span>
      {/* Stacked, the line runs the card's width, so it hangs under the title
          rather than under the check-dot (14px dot + 8px gap). */}
      <span className="text-[11px] leading-[1.5] text-[var(--ink-600)] group-data-[layout=stack]/roles:pl-[22px]">
        {detail}
      </span>
    </button>
  );
}

/**
 * The switch between two ways of doing one dialog's job — the Roster's Invite
 * is "by email" or "with a join link".
 *
 * Drawn as the Matches list's status pills (`lifecycle-chips.tsx`): a fixed
 * pair, 26px, the chosen one on `--surface-subtle` under a `--border-medium`
 * edge. No rule under it and no blue — the dialog's blue belongs to its
 * primary and its chosen radio. Each pill leads with a 13px glyph, the one
 * thing the status pills do not carry (design owner's call, 2026-10-08).
 *
 * A `tablist`, hand-built: there are two tabs and the hard part is the look.
 * Arrow keys move and select together, since switching costs nothing and
 * keeps whatever was typed.
 */
export function MethodPills<T extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  /** What the pair chooses between, for a screen reader. */
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string; icon: LucideIcon }[];
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + step + options.length) % options.length];
    onValueChange(next.value);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-method="${next.value}"]`)
      ?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex items-center gap-2"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-method={option.value}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200",
              !isActive && "hover:bg-[var(--surface-subtle)]",
            )}
            style={{
              border: `1px solid var(${isActive ? "--border-medium" : "--border-hairline"})`,
              // Unset at rest so the hover class can paint the wash; see
              // `lifecycle-chips.tsx`.
              background: isActive ? "var(--surface-subtle)" : undefined,
              color: isActive ? "var(--ink-900)" : "var(--ink-600)",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            <Icon className="size-[13px]" strokeWidth={1.5} aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
