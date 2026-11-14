"use client";

import { LifecycleChip } from "./lifecycle-chip";
import type { PlayerChipLabels } from "./player-chip-labels";
import type { PlayerFilter } from "./viz-model";

/** The player switch: the report's player first, the other side second. */
export function PlayerChips({
  value,
  onChange,
  labels,
  className = "flex gap-2",
}: {
  value: PlayerFilter;
  onChange: (player: PlayerFilter) => void;
  labels: PlayerChipLabels;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label="Player">
      {(["you", "opponent"] as const).map((side) => (
        <LifecycleChip
          key={side}
          pressed={value === side}
          onClick={() => onChange(side)}
        >
          {labels[side]}
        </LifecycleChip>
      ))}
    </div>
  );
}
