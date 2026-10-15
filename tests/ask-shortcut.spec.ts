import { expect, test } from "@playwright/test";

import {
  isMacPlatform,
  isNewQuestionShortcut,
  newQuestionKeys,
  type AskShortcutEvent,
} from "@/components/dashboard/ask/ask-shortcut";

/**
 * `ask-shortcut.ts` — which key press is "New question" on the Ask page.
 * Offline: an event's fields in, yes or no out.
 *
 * The page calls `preventDefault()` on whatever this accepts, so a matcher
 * that is too generous takes a chord away from the browser — plain ⌘O is
 * "open file" — and one that is too strict leaves the keycaps on the button
 * printing a shortcut that does nothing.
 */

const press = (
  overrides: Partial<AskShortcutEvent> = {},
): AskShortcutEvent => ({
  key: "O",
  code: "KeyO",
  shiftKey: true,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...overrides,
});

test.describe("isNewQuestionShortcut", () => {
  test("⇧⌘O on a Mac", () => {
    expect(isNewQuestionShortcut(press({ metaKey: true }), true)).toBe(true);
  });

  test("Ctrl+Shift+O elsewhere", () => {
    expect(isNewQuestionShortcut(press({ ctrlKey: true }), false)).toBe(true);
  });

  test("the other platform's pair is not this shortcut", () => {
    expect(isNewQuestionShortcut(press({ ctrlKey: true }), true)).toBe(false);
    expect(isNewQuestionShortcut(press({ metaKey: true }), false)).toBe(false);
  });

  test("Shift is required: ⌘O and Ctrl+O stay the browser's", () => {
    expect(
      isNewQuestionShortcut(press({ metaKey: true, shiftKey: false }), true),
    ).toBe(false);
    expect(
      isNewQuestionShortcut(press({ ctrlKey: true, shiftKey: false }), false),
    ).toBe(false);
  });

  test("nothing else may be held", () => {
    expect(
      isNewQuestionShortcut(press({ metaKey: true, altKey: true }), true),
    ).toBe(false);
    expect(
      isNewQuestionShortcut(press({ metaKey: true, ctrlKey: true }), true),
    ).toBe(false);
    expect(
      isNewQuestionShortcut(press({ metaKey: true, ctrlKey: true }), false),
    ).toBe(false);
  });

  test("Shift+O alone is a capital letter, not a shortcut", () => {
    expect(isNewQuestionShortcut(press(), true)).toBe(false);
    expect(isNewQuestionShortcut(press(), false)).toBe(false);
  });

  test("another key with the same modifiers is not it", () => {
    expect(
      isNewQuestionShortcut(
        press({ metaKey: true, key: "P", code: "KeyP" }),
        true,
      ),
    ).toBe(false);
    expect(
      isNewQuestionShortcut(
        press({ ctrlKey: true, key: "0", code: "Digit0" }),
        false,
      ),
    ).toBe(false);
  });

  test("the physical O key counts whatever character Shift makes of it", () => {
    expect(
      isNewQuestionShortcut(press({ metaKey: true, key: "Ø" }), true),
    ).toBe(true);
  });

  test("without a `code`, the character decides, in either case", () => {
    for (const key of ["o", "O"]) {
      expect(
        isNewQuestionShortcut(
          press({ metaKey: true, key, code: undefined }),
          true,
        ),
      ).toBe(true);
    }
    expect(
      isNewQuestionShortcut(
        press({ metaKey: true, key: "Home", code: undefined }),
        true,
      ),
    ).toBe(false);
  });
});

test.describe("the platform and its keycaps", () => {
  test("a Mac is a Mac by platform or by user agent", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(
      isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
    expect(isMacPlatform("")).toBe(false);
  });

  test("three keycaps either way", () => {
    expect(newQuestionKeys(true)).toEqual(["⇧", "⌘", "O"]);
    expect(newQuestionKeys(false)).toEqual(["Ctrl", "⇧", "O"]);
  });
});
