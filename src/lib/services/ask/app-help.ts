import type { AskHelpLink } from "@/lib/services/ask/events";
import type { AskScope } from "@/lib/services/ask/scope";
import { WIZARD_FROM_ASK_HREF } from "@/lib/matches/new-match-visit";
import {
  canUploadForProgram,
  isProgramStaff,
  uploadPolicyLabel,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * Questions about using the app rather than about the matches: "I want to
 * upload a match", "how do I add a video". The planner can only refuse
 * these — no view records them, and its refusal may carry no suggestion — so
 * a new coach typing one into Ask met "the program's match data can't answer
 * that" and nothing to click. The route reads them before the cache, the
 * example search and the question's reservation, so asking one is free even
 * with no questions left, and answers with the page that does it.
 *
 * Deliberately narrow: the whole question has to be the request, so a
 * question that only mentions an upload or a video ("give me videos of
 * Rudy's aces", "how did my uploaded match go?") still goes to the planner.
 *
 * No model and no database: the workspace it reads is the route's own.
 */

export interface AskAppHelp {
  /** The sentence shown in the answer's place. */
  message: string;
  /** Where the request is done, or null when this viewer cannot do it. */
  link: AskHelpLink | null;
}

/** The team wizard: staff pick a line, a player gets the wizard itself. */
const TEAM_UPLOAD_HREF = "/dashboard/team/upload";

// What may come before the request: a greeting, then "I want to", "how do I"…
const LEAD =
  "(?:(?:hi|hey|hello|please|ok|okay)\\s+)*" +
  "(?:(?:i\\s+(?:want|need|would\\s+like|am\\s+trying)\\s+to" +
  "|id\\s+like\\s+to|im\\s+trying\\s+to|i\\s+wanna" +
  "|how\\s+(?:do|can|would|should)\\s+(?:i|we)" +
  "|how\\s+to" +
  "|where\\s+(?:do|can)\\s+(?:i|we)" +
  "|(?:can|could|may)\\s+(?:i|we)" +
  "|let\\s+me|help\\s+me|lets|let\\s+us)\\s+)?";
const VERB = "(?:upload|add|send|submit|import|enter|log|record)";
const DETERMINERS =
  "(?:\\s+(?:a|an|my|our|the|new|another|this|one|more|full|tennis))*";
const OBJECT =
  "\\s+(?:match(?:es)?|video(?:s)?|game(?:s)?|footage|recording(?:s)?|file(?:s)?|swingvision(?:\\s+(?:file|export|data))?)";
const TAIL =
  "(?:\\s+(?:video|videos|file|files|footage|export|data))?" +
  "(?:\\s+(?:here|now|please|for\\s+analysis|to\\s+(?:advantage|analyse|analyze|the\\s+app|ask)))*";

/** A verb and what it uploads: "upload a match", "add my video", "send match footage". */
const UPLOAD_WITH_OBJECT = new RegExp(
  `^${LEAD}${VERB}${DETERMINERS}${OBJECT}${TAIL}$`,
);
/** "Upload" on its own reads the same; "add" or "send" on its own does not. */
const UPLOAD_ALONE = new RegExp(`^${LEAD}(?:upload|import)${TAIL}$`);

/** Lower case, apostrophes dropped (`i'd` → `id`), other punctuation as spaces. */
function normalise(question: string): string {
  return question
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether a question asks how to upload a match, rather than about one. */
export function asksToUpload(question: string): boolean {
  const text = normalise(question);
  return UPLOAD_WITH_OBJECT.test(text) || UPLOAD_ALONE.test(text);
}

/**
 * What this viewer may do on the team upload page, as `readAppHelp()` needs
 * it — read by the route off the membership-checked workspace
 * (`askUploadAccess()`), never off the request.
 *
 * - `allowed` — the page opens and video can be sent.
 * - `pending` — the program is still being confirmed: the page opens, but
 *   only SwingVision imports go through until it is (`canSubmitVideo`).
 * - `policy` — the program's upload policy keeps this member out
 *   (`canUploadForProgram()`): the page turns them away. `limitedTo` is the
 *   policy's label in a sentence ("owner and coaches"), or null when uploads
 *   are open to everyone and only this player's own grant is off; `staff`
 *   decides who can change it.
 */
export type AskUploadAccess =
  | { kind: "allowed" }
  | { kind: "pending" }
  | { kind: "policy"; limitedTo: string | null; staff: boolean };

const ALLOWED: AskUploadAccess = { kind: "allowed" };

/**
 * A team workspace's `AskUploadAccess`, in the order the team upload page
 * asks: the policy first (it decides whether the page opens at all), then
 * the claim state (it holds video back on a page that did open).
 */
export function askUploadAccess(workspace: Workspace): AskUploadAccess {
  if (!canUploadForProgram(workspace)) {
    return {
      kind: "policy",
      limitedTo:
        workspace.uploadPolicy === "everyone"
          ? null
          : uploadPolicyLabel(workspace.uploadPolicy).toLowerCase(),
      staff: isProgramStaff(workspace),
    };
  }
  return workspace.canSubmitVideo ? ALLOWED : { kind: "pending" };
}

/**
 * The page a question about using the app is answered with, or null for a
 * question about the matches.
 *
 * A team answer follows `access`, the same rule the team Ask page hides its
 * own upload button by, so nobody is sent to a page that turns them away. Its
 * sentences are Ask's own: the upload wizard's refusals talk about "this
 * match", and here no match has been chosen.
 */
export function readAppHelp(
  question: string,
  scope: AskScope,
  access: AskUploadAccess = ALLOWED,
): AskAppHelp | null {
  if (!asksToUpload(question)) return null;
  if (scope.kind === "personal") {
    return {
      message: "You add a match from the upload page.",
      link: {
        href: WIZARD_FROM_ASK_HREF,
        label: "Upload a match",
        kind: "upload",
      },
    };
  }
  const name = scope.programName;
  switch (access.kind) {
    case "allowed":
      return {
        message: `Match videos for ${name} are sent from the upload page.`,
        link: {
          href: TEAM_UPLOAD_HREF,
          label: "Send match video",
          kind: "upload",
        },
      };
    case "pending":
      // The page still opens: only video waits for the confirmation.
      return {
        message: `${name} is still being confirmed, so match video can't be sent yet. SwingVision imports work now.`,
        link: {
          href: TEAM_UPLOAD_HREF,
          label: "Import from SwingVision",
          kind: "upload",
        },
      };
    case "policy":
      return {
        message:
          access.limitedTo === null
            ? `${name} turns uploads on player by player, and yours isn't on yet. A coach can send the match or turn uploads on for you.`
            : `${name} limits match uploads to ${access.limitedTo}, so your account can't add one. ` +
              (access.staff
                ? "The owner can widen it in Team settings."
                : "A coach can send the match."),
        link: null,
      };
  }
}
