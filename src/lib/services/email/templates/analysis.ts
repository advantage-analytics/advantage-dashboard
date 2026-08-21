import { siteUrl } from "@/lib/site-url";
import {
  preferenceNote,
  renderEmail,
  renderText,
  type EmailContent,
} from "../shell";
import type { EmailMessage } from "../send";

/**
 * The two emails a match sends about itself.
 *
 * Both answer the preference switches on Settings › Preferences, which have
 * existed and promised email since that screen shipped. Nothing sent them
 * until now, which is why they are here together — a product that offers to
 * tell you when analysis fails and then does not is worse than one that never
 * offered.
 *
 * Turnaround on a real 86-minute match was 75 minutes. Nobody waits on a page
 * for that, which is the whole argument for these existing at all.
 */

function matchUrl(matchId: string): string {
  return `${siteUrl()}/dashboard/matches/${matchId}`;
}

export interface AnalysisReadyInput {
  to: string;
  matchId: string;
  /** "Alex Rivera vs. Jordan Chen" — already in the order the report shows. */
  matchTitle: string;
  /** "Stanford vs. Cal · Singles 3", or a plain date for a personal match. */
  matchContext: string;
  /** Final score as the player entered it. */
  score: string;
  /**
   * True when the vendor is finished but our derivation has not stamped the
   * job — the state the UI calls "Stats pending".
   *
   * It changes the email materially rather than adding a footnote. "Your
   * analysis is ready" pointing at a page with no numbers on it is the same
   * broken promise as a page of zeroes, one step earlier.
   */
  statsPending?: boolean;
}

export function analysisReadyEmail(input: AnalysisReadyInput): EmailMessage {
  const { to, matchId, matchTitle, matchContext, score, statsPending } = input;

  const content: EmailContent = {
    preheader: statsPending
      ? `${matchTitle} has finished processing — the numbers land shortly.`
      : `Serve, return and pressure numbers for ${matchTitle} are in.`,
    eyebrow: statsPending ? "Processing finished" : "Analysis ready",
    heading: statsPending
      ? `${matchTitle} has finished processing`
      : `${matchTitle} is ready`,
    body: statsPending
      ? [
          "Your video has been analysed and the match is safely stored. The statistics are still being worked out, so the report will fill in rather than appear all at once.",
          "Nothing is needed from you — the page updates itself.",
        ]
      : [
          "Every serve, return, hold and break from this match is now on the report — where the serve went, how the return came back, and which points actually turned it.",
        ],
    facts: [
      { label: "Match", value: matchTitle },
      { label: "Where", value: matchContext },
      { label: "Result", value: score },
    ],
    cta: {
      label: statsPending ? "Open the match" : "Open the report",
      url: matchUrl(matchId),
    },
    note: preferenceNote("Email me when analysis is ready"),
  };

  return {
    to,
    subject: statsPending
      ? `${matchTitle} has finished processing`
      : `Your report for ${matchTitle} is ready`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "analysis_ready", pending: statsPending ? "yes" : "no" },
  };
}

export interface AnalysisFailedInput {
  to: string;
  matchId: string;
  matchTitle: string;
  matchContext: string;
  /**
   * What went wrong, in the plainest words available.
   *
   * The vendor sends free text with no stable error codes, so this can be
   * anything. Pass it through rather than paraphrasing — a real message a
   * person can quote back to support beats a friendly one that erases the
   * detail.
   */
  reason: string | null;
  /**
   * Whether the upload is still held, and so whether a retry costs another
   * transfer.
   *
   * A failed job keeps its video deliberately — the point of a retry is having
   * something to retry with — so this is nearly always true, and saying so is
   * the difference between "start again" and "press the button".
   */
  videoRetained: boolean;
}

export function analysisFailedEmail(input: AnalysisFailedInput): EmailMessage {
  const { to, matchId, matchTitle, matchContext, reason, videoRetained } = input;

  const content: EmailContent = {
    preheader: `We couldn't finish analysing ${matchTitle}.`,
    eyebrow: "Analysis failed",
    heading: `We couldn't finish ${matchTitle}`,
    body: [
      "The analysis stopped before it produced a report. This is on us to look at, and no processing time has been charged against your allowance.",
      videoRetained
        ? "Your video is still stored, so trying again costs nothing but the wait — nothing needs uploading a second time."
        : "The video is no longer held for this attempt, so a retry means uploading it again.",
    ],
    facts: [
      { label: "Match", value: matchTitle },
      { label: "Where", value: matchContext },
      ...(reason ? [{ label: "What we were told", value: reason }] : []),
    ],
    cta: { label: "Open the match", url: matchUrl(matchId) },
    // Reply, not a help centre link. A failure is the moment a person most
    // wants a human, and the From address is already a real mailbox.
    note: `Reply to this email if it keeps happening and we'll look at the job directly. ${preferenceNote("Email me if analysis fails")}`,
  };

  return {
    to,
    subject: `Analysis failed for ${matchTitle}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "analysis_failed" },
  };
}
