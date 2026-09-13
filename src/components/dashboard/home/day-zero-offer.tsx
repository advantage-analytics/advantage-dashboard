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
export function DayZeroOffer({
  headline = "Every serve, every point, and one thing to work on.",
  headlineMeasure = "24ch",
  actions = <MatchOfferActions />,
  conditions = MATCH_OFFER_CONDITIONS,
}: {
  /**
   * The one sentence above the buttons. Home's names what the product does;
   * Matches' names what the page holds. Everything below the sentence — the
   * pair of buttons, the conditions — is identical on both, so a player who
   * lands on either page on day zero meets one offer.
   */
  headline?: string;
  /** Where the sentence breaks. Home's is set to break once; Matches' fits one line. */
  headlineMeasure?: string;
  /**
   * The action pair, for the day zeros whose first step is not an upload.
   *
   * Omitted, this draws the match pair below — the personal offer, unchanged
   * to the byte on Home and Matches. A team page passes its own, because
   * Schedule's first step is an event and Roster's is a player, and the
   * geometry above and below the pair is the whole reason this component is
   * shared rather than copied three times.
   *
   * `null` is not the same as omitting it, and the difference is the language
   * feature rather than a convention: a default parameter fills in for
   * `undefined` only, so `null` reaches the JSX and React draws nothing. That
   * is what a player sees on a page only staff can fill — the conditions
   * sentence then carries the whole answer, and nothing on screen refuses on
   * click.
   */
  actions?: React.ReactNode;
  /** The fine print under the pair. Omitted, the video requirements below. */
  conditions?: React.ReactNode;
} = {}) {
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
          maxWidth: headlineMeasure,
        }}
      >
        {headline}
      </p>
      {/*
       * Two ways in, one of them primary.
       *
       * The import path was a clause in the sentence until the wizard could
       * tell the two apart: both controls opened the same URL on the same
       * step, so a second control was promising a door that did not exist.
       * `?source=swing-vision` preselects the Source field, so the ghost now
       * lands somewhere the primary does not.
       *
       * A ghost, not a second primary, and a short label. "Import a
       * SwingVision export" ran to 209px beside a 119px primary, and the
       * bigger grey button stopped the blue one reading as the main action;
       * "Import instead" sits at 124px. It says what this button is relative
       * to the other, and leaves naming the source to the sentence directly
       * beneath, which does it better than a label can.
       *
       * It does not skip step one — that step also asks whose match this is,
       * and nothing may carry a viewer past that unreviewed — so the pair is
       * one route with two entrances, not two routes. The import entrance is
       * the only one that reaches a report inside the same session, for the
       * one segment none of the video requirements apply to.
       */}
      {/*
       * "Send match video", not "Send a match". Beside "Import instead" the
       * primary's job is to name the OTHER path, and "a match" is what both
       * paths deliver — an export is a match too. The video is the artifact a
       * player actually holds, and "match video" is the product's own term for
       * it (guardrails: never a highlight or a condensed cut). Verb + object
       * with no article, the way the system writes "Save changes" and "View
       * report". 146px against the ghost's 124, so the hierarchy holds.
       */}
      {actions}
      <p
        className="text-micro text-center"
        style={{ maxWidth: "52ch", textWrap: "pretty" }}
      >
        {conditions}
      </p>
    </div>
  );
}

/**
 * The match offer's own pair and fine print.
 *
 * Named exports rather than JSX buried in a default, so the strings have one
 * spelling and a caller can ask for them back explicitly. They stay the
 * parameter defaults above rather than something Home and Matches pass in:
 * those two are the callers this component was written for, and making them
 * restate it is exactly how the two personal day zeros stop being identical.
 */
export function MatchOfferActions() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/dashboard/matches/new" className={advButton("primary")}>
        Send match video
      </Link>
      <Link
        href="/dashboard/matches/new?source=swing-vision"
        className={advButton("ghost")}
      >
        Import instead
      </Link>
    </div>
  );
}

export const MATCH_OFFER_CONDITIONS =
  "One singles match, 1080p or better, camera fixed for the whole thing. A SwingVision export needs none of that.";
