import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { racedMessage } from "@/lib/services/labels/edit-session";
import {
  isBusinessRefusal,
  SUBMIT_PRACTICE_FAILED,
  SUBMIT_PUBLISH_FAILED,
} from "@/lib/services/labels/submit-session";

/**
 * A labeller's submit shows a refusal as written only when
 * `isBusinessRefusal` knows it; anything else becomes the fixed "Something
 * went wrong" sentence. That match is by text, so a refusal added or reworded
 * in a module on the submit path would silently turn generic. This reads
 * every fixed sentence those modules can answer with and requires each to be
 * either a business refusal or named below as deliberately not one.
 */

const MODULES = [
  "edit-session.ts",
  "session-status-session.ts",
  "submit-session.ts",
  "apply-session.ts",
].map((name) => `src/lib/services/labels/${name}`);

/** Fixed strings in those modules a labeller's submit never reads as written. */
const NOT_BUSINESS = new Set<string>([
  // Log prefixes and codes, not sentences.
  "[labels:edit]",
  "[labels:submit]",
  "[labels:publish]",
  "23505",
  // The fallbacks themselves.
  SUBMIT_PUBLISH_FAILED,
  SUBMIT_PRACTICE_FAILED,
  // An admin's gate and Reopen's own refusal: never a labeller's submit.
  "Administrator access is required.",
  "This session is already open for labelling.",
  // Point and shot edits, which share edit-session.ts: not the submit path.
  "Invalid shot id.",
  "Shot not found.",
  "Restore this shot before editing it.",
  "Invalid point id.",
  "Point not found.",
  "Restore this point before editing it.",
  "Could not save those shots.",
  "This row changed while it was saving. Try again.",
]);

/** Every `error: "…"` literal and every `const NAME = "…"` constant. */
function fixedSentences(source: string): string[] {
  const found: string[] = [];
  for (const re of [
    /error:\s*"((?:[^"\\]|\\.)*)"/g,
    /^(?:export )?const [A-Z_]+\s*=\s*"((?:[^"\\]|\\.)*)"/gm,
  ]) {
    for (const match of source.matchAll(re)) {
      found.push(match[1].replace(/\\(.)/g, "$1"));
    }
  }
  return found;
}

test("every fixed refusal on the submit path is classified", () => {
  const sentences = new Set(
    MODULES.flatMap((path) => fixedSentences(readFileSync(path, "utf8"))),
  );
  expect(sentences.size).toBeGreaterThan(10);
  const unclassified = [...sentences].filter(
    (s) => !isBusinessRefusal(s) && !NOT_BUSINESS.has(s),
  );
  expect(unclassified).toEqual([]);
});

test("the classification sides are disjoint", () => {
  expect([...NOT_BUSINESS].filter(isBusinessRefusal)).toEqual([]);
});

test("races and the publish gate are business; the write failing after it is not", () => {
  expect(isBusinessRefusal(racedMessage("session"))).toBe(true);
  expect(isBusinessRefusal(racedMessage("row"))).toBe(true);
  expect(
    isBusinessRefusal("Not published: there are no points to write."),
  ).toBe(true);
  expect(isBusinessRefusal("Not published — the write failed: boom")).toBe(
    false,
  );
  expect(isBusinessRefusal("Could not submit the session: boom")).toBe(false);
});
