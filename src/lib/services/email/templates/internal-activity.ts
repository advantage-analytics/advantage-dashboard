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
