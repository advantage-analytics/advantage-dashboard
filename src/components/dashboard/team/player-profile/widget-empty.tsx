import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { GHOST_OPACITY } from "@/components/dashboard/home/day-zero-shape";

/**
 * What a profile card says before it holds anything, and the one step that
 * fills it.
 *
 * The card-level day zero the team cards already draw (`DualSheetEmpty`,
 * `TopMovers`): the card's own shape in grey inside `DayZeroShape`, then this
 * band under a hairline — a title, one sentence, one action. Worded by the
 * page, which knows whose profile it is and what this viewer may do; a viewer
 * who cannot act gets the band without the button.
 *
 * The action is an outline, not a primary, and only where it goes somewhere
 * the header does not. The identity row's New match is the page's one blue
 * button (components.md → one primary per surface); a card that repeated its
 * route — Last match, Serve placement — gets the band with no button, the
 * "one action, not two" rule `recent-matches-empty.tsx` records.
 */
export interface WidgetEmptyCopy {
  title: string;
  body: string;
  action?: { label: string; href: string };
}

/** The three rows a card's ghost draws — the product's shared fade. */
export const CARD_GHOST_ROWS = GHOST_OPACITY.slice(0, 3);

export function WidgetEmptyBand({ title, body, action }: WidgetEmptyCopy) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border-hairline)] pt-[18px] pb-1">
      <div className="min-w-0 flex-1 basis-[220px]">
        <span className="block text-[13px] leading-[1.4] font-medium text-[var(--ink-900)]">
          {title}
        </span>
        <span
          className="text-body-sm mt-[3px] block"
          style={{ textWrap: "pretty" }}
        >
          {body}
        </span>
      </div>
      {action && (
        <Link
          href={action.href}
          className={`${advButton("outline", "sm")} shrink-0`}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
