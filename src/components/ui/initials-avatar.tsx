import { getInitials } from "@/lib/data/match-utils";

/**
 * The 26px initials mark that leads a person's name in a table row.
 *
 * Data Table law 1: the name at 13/500 ink-900 sits beside its 26px mark, and
 * every list opens its name column the same way — a player on the Roster, an
 * opponent on Matches, the program or tournament mark on Schedule
 * (`EventMark`, the non-person cousin of this one). It was private to the
 * roster table for a while, which is how Matches came to draw its opponent
 * bare and stopped looking like the other two lists.
 *
 * `aria-hidden` on purpose: the initials are a glyph for the name beside
 * them, not a second reading of it.
 */
export function InitialsAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
    >
      {getInitials(name)}
    </span>
  );
}
