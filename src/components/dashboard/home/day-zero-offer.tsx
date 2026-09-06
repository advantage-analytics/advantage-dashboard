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
 * The measurements are the ones that survived the height study: 36px above,
 * 14px gaps, a 34ch measure so the sentence breaks where it wants rather than
 * at a fixed 24ch, and conditions written to fit one line. That is 216px
 * against the 300px the same block cost before, and the difference is entirely
 * padding and measure — no word was cut to get it.
 */
export function DayZeroOffer() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-3.5 pt-9 pb-6">
      <p
        className="text-center"
        style={{
          fontSize: "30px",
          fontWeight: 300,
          lineHeight: 1.24,
          letterSpacing: "-0.5px",
          color: "var(--ink-900)",
          maxWidth: "34ch",
          textWrap: "balance",
        }}
      >
        Every serve, every point, and one thing to work on.
      </p>
      <Link href="/dashboard/matches/new" className={advButton("primary")}>
        Send a match
      </Link>
      <p className="text-micro text-center">
        One singles match, 1080p or better, camera fixed throughout · or a
        SwingVision export.
      </p>
    </div>
  );
}
