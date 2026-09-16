/**
 * Small 22px plan/action pills for the admin console's Teams and Requests
 * surfaces (T7).
 *
 * Server-renderable on purpose: both exports here are static markup, and the
 * one interactive sibling — `ApproveChip`, which takes an `onClick` — lives in
 * its own `"use client"` file so that rendering a plan tag from a Server
 * Component (`TeamPageHeader`) does not drag a client boundary with it.
 */

/** The amber "waiting on an admin" register, shared with `ApproveChip`. */
export const APPROVE_PILL_CLASS =
  "inline-flex h-[22px] items-center rounded-[var(--radius-pill)] px-[9px] text-[12px] font-medium whitespace-nowrap";

export const APPROVE_PILL_STYLE = {
  background: "var(--warning-bg)",
  color: "var(--warning-text)",
  boxShadow: "inset 0 0 0 1px var(--warning-border)",
} as const;

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
 * The same amber tag as `ApproveChip`, with nothing to press.
 *
 * For surfaces that report a program is waiting on a decision without being
 * the place the decision is made — today the Team page header, where the
 * approve flow is the Teams list's and hasn't been brought over. A button
 * that does nothing is worse than a label: it invites a click and then eats
 * it.
 */
export function ApprovePill() {
  return (
    <span className={APPROVE_PILL_CLASS} style={APPROVE_PILL_STYLE}>
      Approve pilot?
    </span>
  );
}
