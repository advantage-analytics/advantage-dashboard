import type { AskScope } from "@/lib/services/ask/scope";

/**
 * Questions about using the app rather than about the matches: "I want to
 * upload a match", "how do I add a video". The planner can only refuse
 * these — no view records them, and its refusal may carry no suggestion — so
 * a new coach typing one into Ask met "the program's match data can't answer
 * that" and nothing to click. They are read here, before the planner runs,
 * and answered with the page that does it.
 *
 * Deliberately narrow: the whole question has to be the request, so a
 * question that only mentions an upload or a video ("give me videos of
 * Rudy's aces", "how did my uploaded match go?") still goes to the planner.
 *
 * A leaf apart from the scope type: no model, no database.
 */

export interface AskAppHelp {
  /** The sentence shown in the answer's place. */
  message: string;
  /** Where the request is done. Always an in-app path. */
  href: string;
  /** The link's text. */
  label: string;
}

/** The personal wizard, with a way back to Ask (`WIZARD_FROM_ASK_HREF`). */
const PERSONAL_UPLOAD_HREF = "/dashboard/matches/new?return=ask";
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

/** The page a question about using the app is answered with, or null for a question about the matches. */
export function readAppHelp(
  question: string,
  scope: AskScope,
): AskAppHelp | null {
  if (!asksToUpload(question)) return null;
  return scope.kind === "team"
    ? {
        message: `Match videos for ${scope.programName} are sent from the upload page.`,
        href: TEAM_UPLOAD_HREF,
        label: "Send match video",
      }
    : {
        message: "You add a match from the upload page.",
        href: PERSONAL_UPLOAD_HREF,
        label: "Upload a match",
      };
}
