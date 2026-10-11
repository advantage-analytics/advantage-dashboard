"use client";

import { Chip } from "@/components/dashboard/schedule/static/chip";
import {
  FilterTrigger,
  SortTrigger,
} from "@/components/dashboard/shared/list-toolbar-trigger";

const noop = () => {};

/** The fixed view switcher, as the frame draws it — "All" is the resting view. */
const VIEW_LABELS = [
  "All",
  "This season",
  "Played 3 or more",
  "Never beaten",
] as const;

/**
 * The Opponents toolbar at rest, drawn and `inert`: the four view chips on the
 * left, Filters and the sort on the right.
 *
 * Three callers hold this row at one height so nothing moves between them —
 * the loading skeleton, the day-zero shape, and the populated page until the
 * live chips, sort menu and filter panel replace it there. It is `inert` and
 * `aria-hidden` because none of it can do anything yet: a chip that takes
 * focus and changes nothing is worse than one that cannot be reached.
 */
export function OpponentsToolbarStatic() {
  return (
    <div
      inert
      aria-hidden="true"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
    >
      <div className="flex items-center gap-2">
        {VIEW_LABELS.map((label) => (
          <Chip
            key={label}
            label={label}
            active={label === "All"}
            onClick={noop}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <FilterTrigger />
        <SortTrigger>Last played</SortTrigger>
      </div>
    </div>
  );
}
