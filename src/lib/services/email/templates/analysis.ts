import { emailSiteUrl } from "@/lib/site-url";
import {
  preferenceNote,
  renderEmail,
  renderText,
  type EmailContent,
} from "../shell";
import type { EmailMessage } from "../send";
import { showsStoredNote, type RecoveryClass } from "@/lib/data/match-analysis";
import {
  byClass,
  WAIT_OR_ASK_VARIANTS,
  waitOrAskVariant,
} from "@/components/dashboard/matches/analysis-failure-copy";

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
  return `${emailSiteUrl()}/dashboard/matches/${matchId}`;
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
   * The recovery class `classifyFailure()` (`@/lib/data/match-analysis`)
   * assigned this job — decided by the caller (`analysis-mail.ts`) from the
   * same row facts the matches list and match page use, so the email never
   * disagrees with what the UI is already showing. Never
   * `"stats_unavailable"` in practice: the caller sends nothing for that
   * class instead of calling this function.
   */
  failureClass: RecoveryClass;
  /**
   * `processing_jobs.error_code`. Used only to choose which `wait_or_ask`
   * variant applies (`waitOrAskVariant()`) and whether the stored note below
   * is worth showing (`showsStoredNote()`) — never rendered itself. A vendor
   * code or a bare "failed" reads as noise to an athlete; the UI's retry
   * surfaces are where a code belongs.
   */
  errorCode: string | null;
  /**
   * `processing_jobs.error_message`, verbatim. Shown as a fact only when
   * `showsStoredNote(errorCode)` allows it — a `DERIVATION_*` code is the
   * reconciler talking to itself, not something an athlete can read.
   */
  errorMessage: string | null;
}

export function analysisFailedEmail(input: AnalysisFailedInput): EmailMessage {
  const {
    to,
    matchId,
    matchTitle,
    matchContext,
    failureClass,
    errorCode,
    errorMessage,
  } = input;

  // byClass.wait_or_ask is only the allowance default; the row's error code
  // picks the variant that actually applies (same rule the match page's
  // AnalysisSteps and the matches drawer use).
  const copy =
    failureClass === "wait_or_ask"
      ? WAIT_OR_ASK_VARIANTS[waitOrAskVariant(errorCode)]
      : byClass[failureClass];

  const storedNote =
    showsStoredNote(errorCode) && errorMessage ? errorMessage : null;

  const content: EmailContent = {
    preheader: `We couldn't finish analysing ${matchTitle}.`,
    eyebrow: "Analysis failed",
    heading: copy.title,
    body: [copy.cardBody],
    facts: [
      { label: "Match", value: matchTitle },
      { label: "Where", value: matchContext },
      ...(storedNote
        ? [{ label: "What we were told", value: storedNote }]
        : []),
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

export interface AnalysisFailedInternalInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller (`analysis-mail.ts`). */
  to: string;
  jobId: string;
  matchId: string;
  matchTitle: string;
  /**
   * Where it stopped, from `analysisFailureStage()`: "derivation_failed",
   * "failed · downloading_video", or a bare "failed" when the vendor named no
   * step.
   */
  stage: string;
  /** `processing_jobs.error_code` — vendor codes, often absent. */
  errorCode: string | null;
  /** `processing_jobs.error_message`, verbatim. */
  errorMessage: string | null;
  /** Both null when `created_by` is gone — a retained match whose uploader deleted their account. */
  uploaderName: string | null;
  uploaderEmail: string | null;
}

/**
 * The internal copy of a failed analysis — to the alerts inbox, never the
 * athlete.
 *
 * It exists because the athlete's email is optional (`notifyAnalysisFailed`)
 * and says nothing a person could debug from. This one carries the job id,
 * stage and code, and fires whatever the uploader's preferences say.
 */
export function analysisFailedInternalEmail(
  input: AnalysisFailedInternalInput,
): EmailMessage {
  const {
    to,
    jobId,
    matchId,
    matchTitle,
    stage,
    errorCode,
    errorMessage,
    uploaderName,
    uploaderEmail,
  } = input;

  const uploader =
    [uploaderName, uploaderEmail && `(${uploaderEmail})`]
      .filter(Boolean)
      .join(" ") || "Unknown — account deleted";

  const content: EmailContent = {
    preheader: `${matchTitle} stopped at ${stage}.`,
    eyebrow: "Analysis failed",
    heading: `Analysis failed for ${matchTitle}`,
    body: [
      errorMessage
        ? `The job reported: ${errorMessage}`
        : "The job settled as failed without a message.",
    ],
    facts: [
      { label: "Job", value: jobId },
      { label: "Match", value: matchId },
      { label: "Stage", value: stage },
      ...(errorCode ? [{ label: "Code", value: errorCode }] : []),
      { label: "Uploader", value: uploader },
    ],
    cta: { label: "Open the match", url: matchUrl(matchId) },
    note: "Sent to the internal alerts inbox, once per job. The uploader's own email, if they get one, is separate.",
  };

  return {
    to,
    subject: `Analysis failed: ${matchTitle}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "analysis_failed_internal" },
  };
}
