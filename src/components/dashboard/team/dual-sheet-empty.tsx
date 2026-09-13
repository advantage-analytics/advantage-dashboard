import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";

/** The fade the product's day-zero rows share — see `GHOST_OPACITY`. */
const GHOST_ROWS = GHOST_OPACITY.slice(0, 2);

/**
 * The "This weekend" card before any dual is on the schedule.
 *
 * Same card, same eyebrow, same header geometry as `dual-sheet.tsx`, with the
 * opponent, the facts and two lines drawn as grey shapes — Pa2's day-zero
 * treatment (`home/recent-matches-empty.tsx`), so the region is labelled and
 * shaped before it has anything to hold. Under it, one band with the page's
 * instruction and its one action; a player, who cannot add a dual, gets the
 * band without the button.
 */
export function DualSheetEmpty({
  canSchedule,
  isPreview = false,
}: {
  canSchedule: boolean;
  /** Day-zero Home owns the action; this card is then only a preview. */
  isPreview?: boolean;
}) {
  return (
    <section aria-label="This weekend's dual" className="surface-card p-5">
      <span className="eyebrow">This weekend</span>

      <DayZeroShape
        description="No dual on the schedule yet."
        className="mt-3 flex flex-col"
      >
        <div className="flex items-end gap-5">
          <div className="flex flex-col gap-[11px]">
            <GhostRule width="150px" tone="200" shape="tall" />
            <div className="flex gap-3.5">
              <GhostRule width="60px" />
              <GhostRule width="52px" />
            </div>
          </div>
          <div className="flex-1" />
          <GhostRule width="56px" tone="200" shape="tall" />
        </div>
        <div className="mt-3.5 flex flex-col border-t border-[var(--border-hairline)] pt-1">
          {GHOST_ROWS.map((opacity) => (
            <div
              key={opacity}
              className="flex h-[38px] items-center gap-4"
              style={{ opacity }}
            >
              <GhostRule width="16px" />
              <span className="size-[14px] shrink-0 rounded-full border-[1.5px] border-[var(--ink-200)]" />
              <GhostRule width="112px" tone="200" shape="tall" />
              <GhostRule width="88px" />
              <div className="flex-1" />
              <GhostRule width="64px" />
            </div>
          ))}
        </div>
      </DayZeroShape>

      <div className="mt-3.5 flex flex-wrap items-center gap-5 border-t border-[var(--border-hairline)] pt-[22px] pb-1">
        <div className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[1.4] font-medium text-[var(--ink-900)]">
            Nothing here until a dual is on the schedule
          </span>
          <span
            className="text-body-sm mt-[3px] block"
            style={{ textWrap: "pretty" }}
          >
            Add the opponent, the date and the lineup. Results and video land on
            this card as they come in.
          </span>
        </div>
        {canSchedule && !isPreview && (
          <Link
            href="/dashboard/team/schedule/new/dual"
            className={`${advButton("primary")} shrink-0`}
          >
            Add a dual
          </Link>
        )}
      </div>
    </section>
  );
}
