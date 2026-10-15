import {
  ASK_NO_ADVICE_SENTENCE,
  ASK_TEAM_NO_ADVICE_SENTENCE,
  type AskErrorCode,
  type AskStatusStage,
} from "@/lib/services/ask/events";
import type { AskScope } from "@/lib/services/ask/scope";

/**
 * Every sentence on the Ask page that depends on whose matches are being
 * asked about, in one place.
 *
 * The personal page speaks to one player about their own matches ("your
 * matches"). The team page is the same page for a program: whoever is asking
 * — owner, coach, staff or player — is asking about the program's matches, and
 * the answers name players in the third person. So nothing on it may say
 * "your matches": a coach has none, and a player's own are a fraction of what
 * is being read.
 *
 * What is NOT here is the copy that stays the asker's in both scopes: the
 * rail ("Questions you ask are kept here."), the month's count and its reset,
 * "Your question", "You asked". The limit is the asker's own and so are the
 * conversations.
 *
 * Pure strings — no React, no `next/*` — because the
 * composer, the answer and the rail read it and are bundled by offline
 * component harnesses.
 */
export interface AskCopy {
  /** The line under the title before anything is asked. */
  lead: string;
  /** The composer's placeholder. */
  placeholder: string;
  /** The tag button, and the tag menu's accessible name. */
  tagMenuLabel: string;
  /** The tag menu when the text after `@` matches nothing. */
  tagNoMatch: (query: string) => string;
  /** The tag menu when there is nothing to tag at all. */
  tagEmpty: string;
  /** The in-flight status line, by the step the route says it is on. */
  stage: Record<AskStatusStage, string>;
  /** A failed answer, by the stream's `code`. */
  errors: Record<AskErrorCode, { title: string; detail: string }>;
  /** The trend block's key for its dashed mean. */
  trendAverage: string;
  /** The footer's sentence when the question asked what to do. */
  noAdvice: string;
}

const SHARED_ERRORS = {
  llm_unavailable: {
    title: "Advantage Intelligence didn't respond",
    detail: "Try again. Your question is kept.",
  },
  answer_failed: {
    title: "The answer couldn't be completed",
    detail: "Ask the question again.",
  },
  // The title is the question Ask is asking, which comes with the event;
  // this one stands in only when it did not.
  needs_clarification: {
    title: "Which did you mean?",
    detail: "Pick one, or type your own answer. Asking doesn't use a question.",
  },
} as const;

/** The personal page's copy: one player, their own matches. */
export const PERSONAL_ASK_COPY: AskCopy = {
  lead: "Answers are computed from your own matches.",
  placeholder:
    "Ask about a match, an opponent or a stretch of the season. Type @ to tag one.",
  tagMenuLabel: "Tag a match or opponent",
  tagNoMatch: (query) => `No opponent or match matches “${query}”`,
  tagEmpty: "No opponents or matches to tag",
  stage: {
    planning: "Planning the query",
    querying: "Reading your matches",
    writing: "Writing the answer",
  },
  errors: {
    cannot_answer: {
      title: "Your match data can't answer that",
      detail:
        "Ask covers what your own matches recorded: results and scores, serve and return numbers, points and shots.",
    },
    no_data: {
      title: "No matches in that scope",
      detail:
        "None of your matches fit the match, opponent or period you asked about, so there was nothing to compute.",
    },
    ...SHARED_ERRORS,
  },
  trendAverage: "Your average",
  noAdvice: ASK_NO_ADVICE_SENTENCE,
};

/**
 * The team page's copy. Everything but the lead is the same for every
 * program; the lead names the one being read, so the asker can see which
 * workspace the answers come from.
 */
const TEAM_ASK_COPY: Omit<AskCopy, "lead"> = {
  placeholder:
    "Ask about a player, an opponent or a stretch of the season. Type @ to tag one.",
  tagMenuLabel: "Tag a player, match or opponent",
  tagNoMatch: (query) => `No player, opponent or match matches “${query}”`,
  tagEmpty: "No players, opponents or matches to tag",
  stage: {
    planning: "Planning the query",
    querying: "Reading the program's matches",
    writing: "Writing the answer",
  },
  errors: {
    cannot_answer: {
      title: "The program's match data can't answer that",
      detail:
        "Ask covers what the program's matches recorded: results and scores, serve and return numbers, points and shots.",
    },
    no_data: {
      title: "No matches in that scope",
      detail:
        "None of the program's matches fit the player, match, opponent or period you asked about, so there was nothing to compute.",
    },
    ...SHARED_ERRORS,
  },
  // Whose average depends on the question — one player's, or the program's —
  // and the block's caption says which. The key only names the rule.
  trendAverage: "Average",
  noAdvice: ASK_TEAM_NO_ADVICE_SENTENCE,
};

export function askCopy(scope: AskScope): AskCopy {
  if (scope.kind !== "team") return PERSONAL_ASK_COPY;
  return {
    ...TEAM_ASK_COPY,
    lead: `Answers are computed from ${scope.programName}'s matches.`,
  };
}

/**
 * The day-zero offer, when the scope holds no match to ask about.
 *
 * `canUpload` is only a fact inside a program (`canUploadForProgram()`): a
 * team member who may not send video is shown no button — one that refuses
 * on the next page is worse than none — and the fine print says who does
 * fill the page. `conditions` undefined keeps the offer's own video
 * requirements.
 */
export function askDayZeroCopy(
  scope: AskScope,
  canUpload: boolean,
): { headline: string; conditions: string | undefined } {
  if (scope.kind !== "team") {
    return {
      headline: "Send a match, then ask anything about it.",
      conditions: undefined,
    };
  }
  if (canUpload) {
    return {
      headline: "Send a match for the program, then ask anything about it.",
      conditions: undefined,
    };
  }
  return {
    headline: "Ask opens with the program's first match.",
    conditions:
      "Your coaching staff send the program's match video. Once a match is analysed, anyone on the team can ask about it.",
  };
}
