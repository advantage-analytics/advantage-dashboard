import { expect, test } from "@playwright/test";

import { sentences } from "@/components/dashboard/ask/ask-sentences";

/**
 * `ask-sentences.ts` — how an answer's prose is cut into the pieces that fade
 * in one at a time. Offline: a string in, strings out.
 *
 * Two things are held. A figure is never cut in two — "51.8%" split at its
 * decimal point would fade in as "51." and then "8%" — and the pieces joined
 * are the paragraph exactly, because what is rendered is the pieces.
 */

const whole = (paragraph: string) => sentences(paragraph).join("");

test.describe("sentences", () => {
  test("a decimal point is not the end of a sentence", () => {
    expect(sentences("51.8% to 43.8%.")).toEqual(["51.8% to 43.8%."]);
    expect(
      sentences("You won 51.8% of second-serve points. Marcus won 43.8%."),
    ).toEqual(["You won 51.8% of second-serve points.", " Marcus won 43.8%."]);
    expect(sentences("A 1.5 point swing")).toEqual(["A 1.5 point swing"]);
  });

  test("a score keeps its commas and hyphens, and breaks at its full stop", () => {
    expect(sentences("6-3, 6-4. Next one.")).toEqual([
      "6-3, 6-4.",
      " Next one.",
    ]);
  });

  test("a paragraph with no terminal punctuation is one piece", () => {
    expect(sentences("Still arriving, 51.8% so far")).toEqual([
      "Still arriving, 51.8% so far",
    ]);
    expect(sentences("")).toEqual([""]);
  });

  test("question and exclamation marks end a sentence too", () => {
    expect(sentences("Why? Because it held! Good.")).toEqual([
      "Why?",
      " Because it held!",
      " Good.",
    ]);
  });

  test("a mark with no space after it does not break", () => {
    expect(sentences("See advantage-analytics.com for more.")).toEqual([
      "See advantage-analytics.com for more.",
    ]);
    expect(sentences("Wait...what?")).toEqual(["Wait...what?"]);
  });

  test("the pieces joined are the paragraph, byte for byte", () => {
    for (const paragraph of [
      "51.8% to 43.8%.",
      "6-3, 6-4. Next one.",
      "Still arriving, 51.8% so far",
      "Two spaces.  After a stop.\tAnd a tab.\nAnd a line.",
      "Trailing space. ",
      " Leading space.",
      "An ellipsis... then more. And “quotes.” After.",
      "",
    ]) {
      expect(whole(paragraph)).toBe(paragraph);
    }
  });

  test("a sentence already read keeps its place as the paragraph grows", () => {
    // The stream appends; the first piece is the same string at the same
    // index, which is what lets React keep its span and fade only the new one.
    const before = sentences("You held 51.8% of them.");
    const after = sentences("You held 51.8% of them. Marcus held 43.8%");
    expect(after[0]).toBe(before[0]);
    expect(after).toHaveLength(2);
  });
});
