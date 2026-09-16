"use client";

import {
  APPROVE_PILL_CLASS,
  APPROVE_PILL_STYLE,
} from "@/components/admin/plan-pills";

/**
 * A clickable "Approve" pill for a pending claim/request row — the amber
 * warning register, same 22px/12px sizing as `PilotPill`, but a real
 * `<button>` since it takes an action rather than just naming a state.
 *
 * Its own file, and the only client component in this pair: a Server
 * Component cannot hand an event handler across the boundary at all, so the
 * static `ApprovePill` next door is what non-interactive surfaces render.
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
      className={`${APPROVE_PILL_CLASS} cursor-pointer transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60`}
      style={APPROVE_PILL_STYLE}
    >
      Approve
    </button>
  );
}
