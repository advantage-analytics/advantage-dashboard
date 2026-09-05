import type { EventKind } from "@/lib/schedule/types";

/**
 * The square mark beside an event's name — design `Tc2`'s legend row.
 *
 * A dual carries the opponent program's initials on `--surface-subtle`; a
 * tournament carries the DS tournament glyph, because there is no program to
 * show. Two sizes, drawn on two surfaces: 26px in the table's Event cell and
 * 48px at the head of the drawer. `radius-button` on both — the legend says
 * "6px radius" in as many words.
 */
export function EventMark({
  kind,
  name,
  size,
}: {
  kind: EventKind;
  name: string;
  size: 26 | 48;
}) {
  const large = size === 48;
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? "flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[14px] font-medium tracking-[0.2px] text-[var(--ink-700)]"
          : "flex size-[26px] shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
      }
    >
      {kind === "tournament" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a static SVG in /public, no optimisation to do
        <img
          src="/icons/tournament-icon.svg"
          alt=""
          className={large ? "block size-5" : "block size-[13px]"}
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
