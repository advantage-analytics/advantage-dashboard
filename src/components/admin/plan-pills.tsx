/**
 * Small 22px plan/action pills for the admin console's Teams and Requests
 * surfaces (T7).
 */

/**
 * The plan tag for a team account on the free pilot seat.
 *
 * Its own hue, not a second blue: v3 reserves blue-tinted pills for "New"
 * alone (`.skills/advantage-analytics-design/SKILL.md`), so this uses the
 * violet `--pilot-bg`/`--pilot-text` pair instead of reaching for the accent.
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
