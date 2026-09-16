import { conferenceInitials } from "@/lib/services/programs/conference-format";
import { cn } from "@/lib/utils";

/**
 * A conference's mark: its initials on a rounded square.
 *
 * The same grammar as `ProgramCrest`'s initials fallback — a square, never a
 * circle, because the circle belongs to people (`InitialsAvatar`) — but a
 * conference has no uploaded crest, so there is only the one state. What it
 * prints comes from `conferenceInitials`: the short name when it fits in three
 * characters, otherwise the name's initials ("Big 12 Conference" → "B12").
 *
 * Sizes are the Conferences frame's `.crest.sm` (24), `.crest` (28, the table
 * row) and `.crest.lg` (40, the drawer head). Decorative: the name always sits
 * beside it, so the mark is hidden from assistive technology.
 */
export function ConferenceMark({
  name,
  shortName,
  size = 28,
  className,
}: {
  name: string;
  shortName: string | null;
  /** 24 in compact lists, 28 in the admin conferences table, 40 at the head of the drawer. */
  size?: 24 | 28 | 40;
  className?: string;
}) {
  const box =
    size === 40
      ? "size-[40px] text-[12px]"
      : size === 28
        ? "size-[28px] text-[11px]"
        : "size-[24px] text-[11px]";

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] leading-none font-semibold text-[var(--ink-700)]",
        className,
      )}
    >
      {conferenceInitials(name, shortName)}
    </span>
  );
}
