import { matchFilmHref } from "@/lib/match-video/film-entry";
import { siteUrl } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * "A match video will be removed on Oct 23."
 *
 * Sent by the daily cleanup cron (SwingVision Add video T9) to the person who
 * added the video, once per retention clock, when nobody has watched it for
 * `MATCH_VIDEO_EXPIRY_DAYS - MATCH_VIDEO_EXPIRY_WARN_DAYS` days. It says three
 * things and nothing else: which video, when it goes, and that the statistics
 * stay — a player reading "removed" worries about the match, and the match is
 * never touched.
 *
 * Deliberately NOT behind a Settings switch: it is the only notice before
 * something of theirs is deleted, and a switch that silences it would turn an
 * expiry into a surprise. The footer names the reason instead.
 *
 * Every date is formatted in UTC — the sweep compares against `now()` in
 * Postgres, and a local-zone date would disagree by up to a day.
 */
export interface MatchVideoExpiryInput {
  to: string;
  /** The uploader's display name; the caller falls back to their address. */
  recipientName: string;
  matchId: string;
  player1Name: string;
  player2Name: string;
  /** `matches.date`. Null drops the parenthetical, never prints "Invalid Date". */
  matchDate: Date | null;
  /** `matchVideoExpiry().expiresAt` — the clock plus a year. */
  expiresAt: Date;
  /** "Cardinal · M" for a team video; null for a personal one, which drops it. */
  teamLabel: string | null;
}

const DAY_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The warning goes out on day 335 of the clock, 30 days before removal. The
 * copy says "11 months" on every video, as the approved design does: at day
 * 335 the whole-calendar-month count is 10 or 11 depending on the dates, and
 * the user chose the fixed, approximate wording over a number that changes
 * from one email to the next (2026-09-24).
 */
const UNWATCHED = "11 months";

export function matchVideoExpiryEmail(
  input: MatchVideoExpiryInput,
): EmailMessage {
  const {
    to,
    recipientName,
    matchId,
    player1Name,
    player2Name,
    matchDate,
    expiresAt,
    teamLabel,
  } = input;

  const removeOn = DAY_MONTH.format(expiresAt);
  const matchName = `${player1Name.trim()} vs ${player2Name.trim()}`;
  const played =
    matchDate && !Number.isNaN(matchDate.getTime())
      ? ` (${DAY_MONTH_YEAR.format(matchDate)})`
      : "";
  const heading = `A match video will be removed on ${removeOn}`;
  const footer = `Sent to ${recipientName.trim()} because you added this video.${
    teamLabel?.trim() ? ` ${teamLabel.trim()}` : ""
  }`;

  const content: EmailContent = {
    preheader: `Nobody has watched the video on ${matchName} in ${UNWATCHED}. The statistics stay.`,
    eyebrow: "Match video",
    heading,
    body: [
      [
        { text: "Nobody has watched the video on " },
        { text: matchName, strong: true },
        {
          text: `${played} in ${UNWATCHED}. We remove match videos after a year without a view. The statistics stay.`,
        },
      ],
    ],
    cta: {
      label: "Keep this video",
      url: `${siteUrl()}${matchFilmHref(matchId)}`,
    },
    note: "Watching any point of it keeps it too. Nothing to do if you don't need the film.",
    footer,
  };

  return {
    to,
    subject: heading,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "match_video_expiry" },
  };
}
