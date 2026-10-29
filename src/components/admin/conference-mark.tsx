import { conferenceInitials } from "@/lib/services/programs/conference-format";
import { cn } from "@/lib/utils";

/**
 * A conference's mark: its uploaded crest, or its initials on a rounded square.
 *
 * The same grammar as `ProgramCrest` — a square, never a circle, because the
 * circle belongs to people (`InitialsAvatar`). The crest is
 * `conferences.crest_path` in the public `program-crests` bucket (migration
 * `20261028213239_conference_crests`); with none, it prints
 * `conferenceInitials`: the short name when it fits in three characters,
 * otherwise the name's initials ("Big 12 Conference" → "B12").
 *
 * Sizes: 24 in compact lists, 28 in the merge dialog's target, 32 in the
 * Admin › Conferences table row (Conferences2: 8px radius, inset hairline),
 * 40 at the head of the drawer. Decorative: the name always sits beside it,
 * so the mark is hidden from assistive technology.
 */
export function ConferenceMark({
  name,
  shortName,
  crestUrl = null,
  size = 28,
  className,
}: {
  name: string;
  shortName: string | null;
  /** Public URL of the uploaded crest, or null for the initials. */
  crestUrl?: string | null;
  size?: 24 | 28 | 32 | 40;
  className?: string;
}) {
  const box =
    size === 40
      ? "size-[40px] rounded-[var(--radius-element)] text-[12px]"
      : size === 32
        ? "size-[32px] rounded-[var(--radius-element)] text-[10px] tracking-[1px]"
        : size === 28
          ? "size-[28px] rounded-[var(--radius-button)] text-[11px]"
          : "size-[24px] rounded-[var(--radius-button)] text-[11px]";

  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512 KB crest from a public bucket; next/image has no host allow-listed
      <img
        decoding="async"
        src={crestUrl}
        alt=""
        aria-hidden="true"
        className={cn(
          box,
          "shrink-0 bg-[var(--surface-subtle)] object-cover",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex shrink-0 items-center justify-center bg-[var(--surface-subtle)] leading-none whitespace-nowrap",
        size === 32
          ? "font-medium text-[var(--ink-600)] shadow-[inset_0_0_0_1px_var(--border-hairline)]"
          : "font-semibold text-[var(--ink-700)]",
        className,
      )}
    >
      {conferenceInitials(name, shortName)}
    </span>
  );
}
