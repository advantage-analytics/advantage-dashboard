import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The offer, centred, on the day the account holds no match.
 *
 * Three elements and no subline: the sentence takes the page's hero step on
 * its own, then the action, then the conditions on one line. "All of it from
 * one match" was a second run carrying a clause that fits inside the first.
 *
 * 30px is a deliberate exception. Every other page title in the product runs
 * 24px; this is the one screen with nothing else competing for the first
 * glance, so the sentence is allowed to lead it.
 *
 * The block keeps its drawn proportions rather than the tighter ones a height
 * study offered: 70px above, 24px gaps, a 24ch measure that breaks the
 * sentence over two lines, and the conditions at their full 52ch. It costs
 * about 80px more than the compressed version and spends all of it on air —
 * the gap between the sentence and the button is what gives the action room,
 * and closing it makes the block read as page content rather than as the one
 * thing on the screen.
 */
export function DayZeroOffer() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-6 pt-[70px] pb-[38px]">
      <p
        className="text-center"
        style={{
          fontSize: "30px",
          fontWeight: 300,
          lineHeight: 1.24,
          letterSpacing: "-0.5px",
          color: "var(--ink-900)",
          maxWidth: "24ch",
        }}
      >
        Every serve, every point, and one thing to work on.
      </p>
      <Link href="/dashboard/matches/new" className={advButton("primary")}>
        Send a match
      </Link>
      {/*
       * The import path, as a link rather than a second button.
       *
       * It was a sentence until the wizard could tell the two apart: both
       * controls opened the same URL on the same step, so the second was
       * promising a door that did not exist. `?source=swing-vision`
       * preselects the Source field, so the link now lands somewhere the
       * button does not.
       *
       * Still a link, not a button. It does not skip step one — that step
       * also asks whose match this is, and nothing may carry a viewer past
       * that unreviewed — so it is a shorter way in, not a second route. And
       * it is the one path that reaches a report inside the same session,
       * for the only segment none of the video requirements apply to.
       */}
      <p
        className="text-micro text-center"
        style={{ maxWidth: "52ch", textWrap: "pretty" }}
      >
        One singles match, 1080p or better, camera fixed for the whole thing.{" "}
        <Link
          href="/dashboard/matches/new?source=swing-vision"
          className="rounded-sm font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
        >
          Or import a SwingVision export
        </Link>
        , which needs none of that.
      </p>
    </div>
  );
}
