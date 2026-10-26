import {
  FIRST_MATCH_FEEDBACK_WORDS,
  type FirstMatchFeedbackRating,
} from "@/lib/feedback/first-match-feedback";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * "Somebody new is here" and "somebody uploaded a match" — the two FYIs the
 * internal alerts inbox gets about ordinary activity, as opposed to the
 * failures and review queues the other internal mail is about.
 *
 * Both are fired by Postgres, not by the app: a trigger on `public.users` and
 * on the two upload tables calls `/api/webhooks/internal-events` through
 * `pg_net` (`internal_activity_alerts` migration), and
 * `services/notifications/internal-activity-mail.ts` reads the row and sends.
 * That is the point of doing it there — a signup can arrive through password,
 * magic link, an invite or a join link, and a match through the wizard, the
 * MCP connector or an admin upload, and a trigger sees every one of them.
 */

export interface SignupInternalInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller. */
  to: string;
  userId: string;
  email: string;
  /** Usually null: a name is typed in onboarding, after the row exists. */
  name: string | null;
  /** `auth.users.app_metadata.provider` — `email`, `google`, … */
  signInMethod: string | null;
  /** Pre-built by the caller: `${emailOrigin()}/admin`. */
  adminUrl: string;
}

export function signupInternalEmail(input: SignupInternalInput): EmailMessage {
  const { to, userId, email, name, signInMethod, adminUrl } = input;
  const who = name ? `${name} (${email})` : email;

  const content: EmailContent = {
    preheader: `${who} just created an account.`,
    eyebrow: "New signup",
    heading: `${name ?? email} signed up`,
    body: [
      name
        ? `${who} just created an account.`
        : `${email} just created an account. They have not finished onboarding, so there is no name yet.`,
    ],
    facts: [
      { label: "Email", value: email },
      ...(name ? [{ label: "Name", value: name }] : []),
      ...(signInMethod ? [{ label: "Sign-in", value: signInMethod }] : []),
      { label: "Account", value: userId },
    ],
    cta: { label: "Open admin", url: adminUrl },
    note: "Sent to the internal alerts inbox, once per account.",
  };

  return {
    to,
    subject: `New signup: ${email}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "signup_internal" },
  };
}

export type UploadKind = "video" | "swingvision";

export interface UploadInternalInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller. */
  to: string;
  kind: UploadKind;
  matchId: string;
  /** "A vs. B", or `Match <id>` when the row is gone. */
  matchTitle: string;
  /** `describeContext()` — "Stanford Men's Tennis · 14 Sep 2026". */
  context: string;
  uploaderName: string | null;
  uploaderEmail: string | null;
  /** Pre-built by the caller: `${emailOrigin()}/dashboard/matches/<id>`. */
  matchUrl: string;
}

const KIND_LABEL: Record<UploadKind, string> = {
  video: "Video",
  swingvision: "SwingVision",
};

export function uploadInternalEmail(input: UploadInternalInput): EmailMessage {
  const {
    to,
    kind,
    matchId,
    matchTitle,
    context,
    uploaderName,
    uploaderEmail,
    matchUrl,
  } = input;

  const uploader =
    [uploaderName, uploaderEmail && `(${uploaderEmail})`]
      .filter(Boolean)
      .join(" ") || "Unknown — account deleted";
  const label = KIND_LABEL[kind];

  const content: EmailContent = {
    preheader: `${uploaderName ?? uploaderEmail ?? "Someone"} uploaded ${matchTitle}.`,
    eyebrow: `${label} upload`,
    heading: matchTitle,
    body: [
      kind === "video"
        ? "The video finished uploading and is on its way to analysis."
        : "A SwingVision export was uploaded and is being imported.",
    ],
    facts: [
      { label: "Source", value: label },
      { label: "Uploader", value: uploader },
      { label: "Match", value: context },
      { label: "Match id", value: matchId },
    ],
    cta: { label: "Open the match", url: matchUrl },
    note: "Sent to the internal alerts inbox, once per upload.",
  };

  return {
    to,
    subject: `${label} upload: ${matchTitle}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "upload_internal", kind },
  };
}

export interface FeedbackInternalInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller. */
  to: string;
  /** `product_feedback.id`. */
  feedbackId: string;
  userId: string;
  playerName: string | null;
  playerEmail: string | null;
  rating: FirstMatchFeedbackRating;
  /** The note in full, or null when none was written. */
  note: string | null;
  /**
   * Whole hours between first reading the report and answering, from the
   * route's saved context; null when the context did not carry it.
   */
  hoursSinceFirstReport: number | null;
  /** Pre-built by the caller: `${emailOrigin()}/admin`. */
  adminUrl: string;
}

/** "9 hours after first reading it" / "3 days after first reading it". */
function sinceFirstReport(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 48)
    return `${hours} hour${hours === 1 ? "" : "s"} after first reading it`;
  const days = Math.round(hours / 24);
  return `${days} days after first reading it`;
}

/**
 * A player answered the first-match feedback question. The one alert the
 * inbox gets that carries a player's own words, so the note is the body,
 * quoted in full — the point of the mail is reading it, not knowing it
 * exists.
 */
export function feedbackInternalEmail(
  input: FeedbackInternalInput,
): EmailMessage {
  const {
    to,
    feedbackId,
    userId,
    playerName,
    playerEmail,
    rating,
    note,
    hoursSinceFirstReport,
    adminUrl,
  } = input;

  const word = FIRST_MATCH_FEEDBACK_WORDS[rating];
  const player = playerName ?? playerEmail ?? "A player";
  const who =
    [playerName, playerEmail && `(${playerEmail})`].filter(Boolean).join(" ") ||
    "Unknown — account deleted";
  const when = sinceFirstReport(hoursSinceFirstReport);

  const content: EmailContent = {
    preheader: `${player} rated their first report ${rating} of 5${note ? " and left a note." : "."}`,
    eyebrow: "First-match feedback",
    heading: `${word} — ${rating} of 5`,
    body: [
      [
        { text: player, strong: true },
        {
          text: ` answered the first-match question${when ? `, ${when}` : ""}.`,
        },
      ],
      note
        ? [{ text: "“" }, { text: note, strong: true }, { text: "”" }]
        : "No note.",
    ],
    facts: [
      { label: "Rating", value: `${rating} of 5 — ${word}` },
      { label: "Player", value: who },
      ...(when ? [{ label: "Answered", value: when }] : []),
      { label: "Account", value: userId },
      { label: "Feedback id", value: feedbackId },
    ],
    cta: { label: "Open admin", url: adminUrl },
    note: "Sent to the internal alerts inbox, once per answer.",
  };

  return {
    to,
    subject: `First-match feedback: ${rating}/5 from ${player}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "feedback_internal", rating: String(rating) },
  };
}
