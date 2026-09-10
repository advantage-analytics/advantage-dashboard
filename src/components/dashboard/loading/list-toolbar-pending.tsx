"use client";

import { LifecycleChips } from "@/components/dashboard/matches/lifecycle-chips";
import { Chip } from "@/components/dashboard/schedule/static/chip";
import {
  FilterTrigger,
  SortTrigger,
} from "@/components/dashboard/shared/list-toolbar-trigger";

const noop = () => {};

export function MatchesToolbarPending() {
  return (
    <div
      inert
      aria-hidden="true"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
    >
      <LifecycleChips active="all" onSelect={noop} />
      <div className="flex items-center gap-2">
        <FilterTrigger />
        <SortTrigger>Newest first</SortTrigger>
      </div>
    </div>
  );
}

export function ScheduleToolbarPending() {
  return (
    <div inert aria-hidden="true" className="flex items-center gap-2">
      {["All", "Upcoming", "Completed"].map((label) => (
        <Chip
          key={label}
          label={label}
          active={label === "All"}
          onClick={noop}
        />
      ))}
      <div className="flex-1" />
      <FilterTrigger />
      <SortTrigger>Newest first</SortTrigger>
    </div>
  );
}
