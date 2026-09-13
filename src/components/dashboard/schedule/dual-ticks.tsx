import { DOUBLES_SLOTS, SINGLES_SLOTS } from "@/lib/schedule/courts";
import { lineWon } from "@/lib/schedule/entry-state";
import type { EventEntry } from "@/lib/schedule/types";

/** A college dual's full card: six singles lines and three doubles. */
const DUAL_SINGLES = SINGLES_SLOTS.length;
const DUAL_DOUBLES = DOUBLES_SLOTS.length;

/**
 * `sm` is the Form Ticks size the drawer draws. `lg` is the same strip at twice
 * the size, for the event page's score band, where it sits beside a 40px score.
 */
const SIZES = {
  sm: { tick: "h-3 w-[2.5px] rounded-[1px]", gap: "gap-[3px]", split: "w-1.5" },
  lg: { tick: "h-6 w-[5px] rounded-[2px]", gap: "gap-[5px]", split: "w-3" },
} as const;

/**
 * A dual's nine courts as Form Ticks (`FormTicks`): 2.5×12px, 3px apart, 1px
 * radius, singles then doubles with a 6px break between them. A decided line
 * takes its colour; an undecided or missing one is the faint `--ink-100` ghost
 * the roster pads its strip with, so a fresh dual reads as nine empty slots.
 *
 * Every tick comes off `lineWon()`, the answer the rows beside it draw, so the
 * strip and the lines cannot disagree about one court. Decorative — the score
 * next to it is what a screen reader hears.
 *
 * Shared by the Schedule drawer and the dual's event page. No `"use client"`:
 * it has no state, so the server-rendered page can draw it.
 */
export function DualTicks({
  singles,
  doubles,
  size = "sm",
}: {
  singles: EventEntry[];
  doubles: EventEntry[];
  size?: keyof typeof SIZES;
}) {
  const { tick, gap, split } = SIZES[size];
  return (
    <span className={`flex items-center ${gap}`} aria-hidden="true">
      {singles.map((entry) => (
        <Tick key={entry.id} entry={entry} className={tick} />
      ))}
      {ghostTicks(DUAL_SINGLES - singles.length, "s", tick)}
      <span className={split} />
      {doubles.map((entry) => (
        <Tick key={entry.id} entry={entry} className={tick} />
      ))}
      {ghostTicks(DUAL_DOUBLES - doubles.length, "d", tick)}
    </span>
  );
}

function Tick({ entry, className }: { entry: EventEntry; className: string }) {
  const won = lineWon(entry, entry.matches[0] ?? null);
  return (
    <span
      className={className}
      style={{
        background:
          won === null
            ? "var(--ink-100)"
            : won
              ? "var(--success)"
              : "var(--danger)",
      }}
    />
  );
}

/** Pads a discipline to its full card with ghosts for lines not yet created. */
function ghostTicks(count: number, key: string, className: string) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    <span
      key={`${key}-ghost-${index}`}
      className={`${className} bg-[var(--ink-100)]`}
    />
  ));
}
