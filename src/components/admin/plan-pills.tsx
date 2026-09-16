"use client";

/**
 * Small 22px plan/action pills for the admin console's Teams and Requests
 * surfaces (T7).
 *
 * `ApproveChip` takes an `onClick`, so this file needs the client boundary
 * even though every existing caller already renders it from inside one —
 * `TeamPageHeader` doesn't, and a plain DOM `<button onClick>` can't cross
 * from a Server Component without an intervening Client Component to own it.
 */

/**
 * The plan tag for a team account on the free pilot seat.
 *
 * Green, per the Admin Console canvas's chosen plan-pill colour (option 5:
 * green Pilot, amber "Approve pilot?"). It gets its own `--pilot-bg`/
 * `--pilot-text` pair rather than borrowing `--success-*`, which the design
 * system fences to match outcomes — a plan is a state, not a result.
 */
export function PilotPill() {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-[var(--radius-pill)] px-[9px] text-[12px] font-medium whitespace-nowrap"
      style={{
        background: "var(--pilot-bg)",
        color: "var(--pilot-text)",
      }}
    >
      Pilot
    </span>
  );
}

/**
 * A clickable "Approve" pill for a pending claim/request row — the amber
 * warning register (`--warning-bg`/`--warning-border`/`--warning-text`),
 * same 22px/12px sizing as `PilotPill`, but a real `<button>` since it takes
 * an action rather than just naming a state.
 */
export function ApproveChip({
  onClick,
  disabled,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[22px] cursor-pointer items-center rounded-[var(--radius-pill)] px-[9px] text-[12px] font-medium whitespace-nowrap transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: "var(--warning-bg)",
        color: "var(--warning-text)",
        boxShadow: "inset 0 0 0 1px var(--warning-border)",
      }}
    >
      Approve
    </button>
  );
}
