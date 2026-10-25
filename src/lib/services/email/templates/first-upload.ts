import { emailOrigin } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * The first-upload nudges — two emails to a player who signed up and has not
 * added a match yet.
 *
 * Step 1 (day 2) points at the SwingVision import: no video, a result in
 * minutes, the shortest way to see what the product does. Step 2 (day 7) is
 * the video path, for the player who has no SwingVision export. Both stop the
 * moment a match exists — the sweep checks before each send.
 *
 * Unlike every other product email these were not caused by something the
 * recipient just did, so they carry the `compliance` block — postal address
 * and a one-click unsubscribe — and a `List-Unsubscribe` header. The
 * unsubscribe turns off "Tips for getting started" in Settings › Preferences.
 */
export type FirstUploadStep = 1 | 2;

export interface FirstUploadNudgeInput {
  to: string;
  step: FirstUploadStep;
  /** The player's first name; null drops the greeting's name. */
  firstName: string | null;
  /** `unsubscribeLinks()`: the footer's page, the header's one-click POST. */
  unsubscribe: { page: string; oneClick: string };
  /** `OUTREACH_POSTAL_ADDRESS`. CAN-SPAM wants it in mail like this. */
  postalAddress: string;
}

export function firstUploadNudgeEmail(
  input: FirstUploadNudgeInput,
): EmailMessage {
  const { to, step, firstName, unsubscribe, postalAddress } = input;
  const content = step === 1 ? stepOne(firstName) : stepTwo(firstName);

  content.compliance = {
    postalAddress,
    unsubscribeUrl: unsubscribe.page,
    reason: "You signed up for Advantage and haven't added a match yet.",
  };

  return {
    to,
    subject: content.heading,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "first_upload_nudge", step: String(step) },
    headers: {
      "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** "Hi Jordan, if you…" with a name, "If you…" without one. */
function hello(firstName: string | null, sentence: string): string {
  const name = firstName?.trim();
  return name
    ? `Hi ${name}, ${sentence}`
    : sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function stepOne(firstName: string | null): EmailContent {
  return {
    preheader:
      "Import a SwingVision export and see your serve, return and rally stats in a few minutes.",
    eyebrow: "Getting started",
    heading: "Your first match takes about two minutes",
    body: [
      hello(
        firstName,
        "if you track matches with SwingVision, you already have everything Advantage needs.",
      ),
      [
        { text: "Export the match from SwingVision as " },
        { text: ".xlsx", strong: true },
        {
          text: " and drop it into Advantage. You'll get your serve and return numbers, where your shots landed, and a short summary of how the match went.",
        },
      ],
    ],
    cta: {
      label: "Add a match",
      url: `${emailOrigin()}/dashboard/matches/new`,
    },
    note: "No SwingVision? You can upload match video instead, from the same page.",
  };
}

function stepTwo(firstName: string | null): EmailContent {
  return {
    preheader:
      "Upload match video and Advantage Intelligence charts every point for you.",
    eyebrow: "Getting started",
    heading: "Got match video? We'll do the charting",
    body: [
      hello(
        firstName,
        "you don't need a tracking app to use Advantage. A match filmed from one fixed camera, raised behind the back fence, is enough.",
      ),
      "Upload it and Advantage Intelligence finds every point: who served, where each shot landed, how each point ended. We'll email you when the analysis is ready.",
    ],
    cta: {
      label: "Upload a match",
      url: `${emailOrigin()}/dashboard/matches/new`,
    },
    note: "Already use SwingVision? Import the .xlsx export from the same page. It's ready in minutes.",
  };
}
