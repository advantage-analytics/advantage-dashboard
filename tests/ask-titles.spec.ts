import { expect, test } from "@playwright/test";

import {
  ASK_TITLE_MAX,
  MAX_ASK_CONVERSATION_TITLE,
  askTitle,
  normalizeAskTitle,
} from "@/lib/services/ask/titles";

/**
 * `titles.ts` — what a conversation is called in the rail: the question's
 * first clause, held to about 48 characters, the headline as the fallback.
 * Offline.
 */

test.describe("askTitle", () => {
  test("a whole short question is the title, question mark kept", () => {
    expect(askTitle("How did my match against Marek Dvorsky go?")).toBe(
      "How did my match against Marek Dvorsky go?",
    );
    expect(askTitle("What is my record against left-handers?")).toBe(
      "What is my record against left-handers?",
    );
  });

  test("the first clause, cut at a comma-conjunction or sentence punctuation", () => {
    expect(
      askTitle("Why do I lose to Marek Dvorsky, and what should I work on?"),
    ).toBe("Why do I lose to Marek Dvorsky");
    expect(
      askTitle("Compare my first serve this season. Then show me by opponent."),
    ).toBe("Compare my first serve this season");
    expect(askTitle("Serve placement — break points only")).toBe(
      "Serve placement",
    );
  });

  test("an initial or a decimal is not a sentence end", () => {
    expect(askTitle("How did I play against J. Smith last week?")).toBe(
      "How did I play against J. Smith last week?",
    );
    expect(askTitle("Did my 4.5 rating opponents beat me?")).toBe(
      "Did my 4.5 rating opponents beat me?",
    );
    expect(
      askTitle("Show my matches against J. R. Smith. Then my serve stats."),
    ).toBe("Show my matches against J. R. Smith");
  });

  test("a comma alone does not end the clause", () => {
    expect(askTitle("Against Marek, how did my serve go?")).toBe(
      "Against Marek, how did my serve go?",
    );
  });

  test("a greeting is not a clause: the whole question stands", () => {
    expect(askTitle("Hi. How did my serve go today?")).toBe(
      "Hi. How did my serve go today?",
    );
  });

  test("a trailing full stop goes, a question mark stays", () => {
    expect(askTitle("Show my record this season.")).toBe(
      "Show my record this season",
    );
  });

  test("held to the limit at a word boundary, with an ellipsis", () => {
    const title = askTitle(
      "Compare my first serve percentage across the last five matches against left-handers this season",
    );
    expect(title).toBe("Compare my first serve percentage across the…");
    expect(title.length).toBeLessThanOrEqual(ASK_TITLE_MAX);
  });

  test("whitespace collapses", () => {
    expect(askTitle("  How   did\n my serve\tgo?  ")).toBe(
      "How did my serve go?",
    );
  });

  test("no words: the headline's first clause, then the fallback", () => {
    expect(askTitle("", "Your second serve held. It breaks down later.")).toBe(
      "Your second serve held",
    );
    expect(askTitle("   ", null)).toBe("New question");
  });
});

test.describe("normalizeAskTitle", () => {
  test("one trimmed line within the column's limit", () => {
    expect(normalizeAskTitle("  My serve\n this  season ")).toBe(
      "My serve this season",
    );
  });

  test("empty and over-long are refused", () => {
    expect(normalizeAskTitle("   ")).toBeNull();
    expect(
      normalizeAskTitle("x".repeat(MAX_ASK_CONVERSATION_TITLE)),
    ).toHaveLength(MAX_ASK_CONVERSATION_TITLE);
    expect(
      normalizeAskTitle("x".repeat(MAX_ASK_CONVERSATION_TITLE + 1)),
    ).toBeNull();
  });
});
