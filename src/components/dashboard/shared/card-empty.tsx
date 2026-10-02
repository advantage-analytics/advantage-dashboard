import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import {
  DayZeroShape,
  GHOST_OPACITY,
} from "@/components/dashboard/home/day-zero-shape";

interface CardEmptyBand {
  title: string;
  body: string;
  action?: { label: string; href: string };
}

/** Whose card this is, for a sentence about them: "Your …" or "Maya's …". */
export interface CardSubject {
  isSelf: boolean;
  firstName: string;
}

/**
 * What a card says before it holds anything, and the one step that fills it.
 *
 * The card-level day zero the team cards draw (`DualSheetEmpty`, `TopMovers`,
 * which still write it out by hand): the card's own shape in grey inside
 * `DayZeroShape`, then a band under a hairline — a title, one sentence, and at
 * most one action. A viewer who cannot act gets the band without the button.
 *
 * The action is an outline, not a primary, and only where it goes somewhere
 * the page's header does not: the header holds the page's one blue button
 * (components.md → one primary per surface), and a card that would repeat its
 * route gets the band with no button — the "one action, not two" rule
 * `recent-matches-empty.tsx` records.
 *
 * The ghost and the band are one piece, so no card can draw the shape without
 * saying what fills it. `description` is `DayZeroShape`'s screen-reader
 * sentence for the dimmed block.
 */
export function CardEmpty({
  description,
  band,
  className,
  children,
}: {
  description: string;
  band: CardEmptyBand;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <DayZeroShape description={description} className={className}>
        {children}
      </DayZeroShape>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border-hairline)] pt-[18px] pb-1">
        <div className="min-w-0 flex-1 basis-[220px]">
          <span className="block text-[13px] leading-[1.4] font-medium text-[var(--ink-900)]">
            {band.title}
          </span>
          <span
            className="text-body-sm mt-[3px] block"
            style={{ textWrap: "pretty" }}
          >
            {band.body}
          </span>
        </div>
        {band.action && (
          <Link
            href={band.action.href}
            className={`${advButton("outline", "sm")} shrink-0`}
          >
            {band.action.label}
          </Link>
        )}
      </div>
    </>
  );
}

/**
 * Three rows of one table's grid, fading on the product's shared ladder —
 * `children` is one row's grey rules, drawn on every row.
 */
export function GhostRows({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return GHOST_OPACITY.slice(0, 3).map((opacity) => (
    <div key={opacity} className={className} style={{ opacity }}>
      {children}
    </div>
  ));
}
