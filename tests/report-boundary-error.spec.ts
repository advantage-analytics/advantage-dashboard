import { expect, test } from "@playwright/test";
import { isFailedFetch } from "@/lib/ui/action-rejected";
import { isReportableBoundaryError } from "@/lib/ui/report-boundary-error";

/**
 * What an error boundary (`error.tsx`, `global-error.tsx`) sends to PostHog.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` — Safari's words for a
 * `fetch` that never got an answer — reported from /label (via
 * `global-error.tsx`) and /admin/labels (via `admin/error.tsx`). A dropped
 * connection is the reader's network, not a bug; a render crash that happens
 * to be a `TypeError` is a bug and must still be reported.
 */

test.describe("isFailedFetch", () => {
  for (const message of [
    "Load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
  ]) {
    test(`TypeError: ${message} is a failed fetch`, () => {
      expect(isFailedFetch(new TypeError(message))).toBe(true);
    });
  }

  test("a render crash is not, even as a TypeError", () => {
    expect(
      isFailedFetch(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      ),
    ).toBe(false);
    expect(isFailedFetch(new Error("Load failed"))).toBe(false);
  });
});

test.describe("isReportableBoundaryError", () => {
  test("a dropped connection is not reported", () => {
    expect(isReportableBoundaryError(new TypeError("Load failed"))).toBe(false);
    expect(isReportableBoundaryError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
    expect(isReportableBoundaryError(new Error("Connection closed."))).toBe(
      false,
    );
  });

  test("a server throw is left to onRequestError", () => {
    expect(
      isReportableBoundaryError(
        Object.assign(new Error("boom"), { digest: "123" }),
      ),
    ).toBe(false);
  });

  test("a browser render crash is reported", () => {
    expect(
      isReportableBoundaryError(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      ),
    ).toBe(true);
    expect(isReportableBoundaryError(new Error("boom"))).toBe(true);
  });
});
