import type { EventKind } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/**
 * The square mark beside an event's name — design `Tc2`'s legend row.
 *
 * A dual carries the opponent program's initials on `--surface-subtle`; a
 * tournament carries the DS tournament glyph, because there is no program to
 * show. Three sizes, drawn on four surfaces: 26px in the schedule table's
 * Event cell (`schedule-table.tsx`), 32px twice — the new-dual picker's
 * directory rows (`dual-school-step.tsx`'s `SchoolRow`) and Team Home's
 * dual-history rail (Platform Audit Ta3) — and 48px at the head of the drawer
 * (`event-drawer.tsx`). `radius-button` on all three: the legend says "6px
 * radius" in as many words.
 *
 * The two 32px call sites arrived on separate branches and met here. Its type
 * is 12px, which is what the rail shipped with and what the scale wants — 26
 * takes 9 and 48 takes 14, so a 32 sharing 26's 9px was the odd one out
 * rather than a decision. That is a 3px change to the picker's initials.
 */
/** The box each size draws — the legend's three, and nothing in between. */
const BOX = { 26: "size-[26px]", 32: "size-8", 48: "size-12" } as const;

export function EventMark({
  kind,
  name,
  size,
}: {
  kind: EventKind;
  name: string;
  size: 26 | 32 | 48;
}) {
  const large = size === 48;
  const medium = size === 32;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-700)]",
        BOX[size],
        // One box map, one type step per size — the alternative was a
        // three-arm ternary repeating the same six classes three times.
        large
          ? "text-[14px] tracking-[0.2px]"
          : medium
            ? "text-[12px]"
            : "text-[9px]",
      )}
    >
      {kind === "tournament" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a static SVG in /public, no optimisation to do
        <img
          src="/icons/tournament-icon.svg"
          alt=""
          className={
            large
              ? "block size-5"
              : medium
                ? "block size-4"
                : "block size-[13px]"
          }
        />
      ) : (
        markInitials(name)
      )}
    </span>
  );
}

/**
 * "Ridgeline University" → "RU", "State College of Ash" → "SC".
 *
 * The first letter of the first two words, which is the rule every mark the
 * design draws follows (RU · FA · SC · HV · NT). Not `getInitials()` from
 * `match-utils.ts` — that takes first AND LAST word, which turns "State
 * College of Ash" into "SA". A one-word school takes its first two letters so
 * the mark never reads as a single floating capital.
 */
export function markInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}
