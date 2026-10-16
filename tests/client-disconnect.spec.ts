import { expect, test } from "@playwright/test";

import { isClientDisconnect } from "../src/lib/client-disconnect";

/**
 * `onRequestError` in instrumentation.ts skips the render abort React raises
 * when the visitor leaves mid-stream (PostHog issue 01a0df0e), and still
 * reports every other error.
 */

test("recognises React's client-closed abort", () => {
  expect(
    isClientDisconnect(new Error("The destination stream closed early.")),
  ).toBe(true);
});

test("keeps other stream and render errors", () => {
  expect(
    isClientDisconnect(
      new Error("The destination stream errored while writing data."),
    ),
  ).toBe(false);
  expect(isClientDisconnect(new Error("Could not load the conversation"))).toBe(
    false,
  );
  expect(isClientDisconnect("The destination stream closed early.")).toBe(
    false,
  );
  expect(isClientDisconnect(null)).toBe(false);
});
