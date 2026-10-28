import { expect, test } from "@playwright/test";
import type { CaptureResult } from "posthog-js";

import { dropUnfixableNoise } from "../src/lib/posthog-noise";

/**
 * The posthog-js `before_send` filter in instrumentation-client.ts drops the
 * Microsoft link-scanner rejection (PostHog issue 01a10378) and the browser's
 * ResizeObserver loop notices (PostHog issue 01a1768a), and nothing else.
 */

function exception(value: string, type = "UnhandledRejection"): CaptureResult {
  return {
    uuid: "00000000-0000-0000-0000-000000000000",
    event: "$exception",
    properties: { $exception_list: [{ type, value }] },
  } as CaptureResult;
}

test("drops the link-scanner rejection", () => {
  const event = exception(
    "Non-Error promise rejection captured with value: Object Not Found Matching Id:1, MethodName:update, ParamCount:4",
  );
  expect(dropUnfixableNoise(event)).toBeNull();
});

test("drops the ResizeObserver loop notices", () => {
  for (const value of [
    "ResizeObserver loop completed with undelivered notifications.",
    "ResizeObserver loop limit exceeded",
  ]) {
    expect(dropUnfixableNoise(exception(value, "Error"))).toBeNull();
  }
});

test("keeps real errors that only mention ResizeObserver", () => {
  for (const value of [
    "ResizeObserver is not defined",
    "Uncaught ResizeObserver loop limit exceeded in chart",
    "Failed to construct 'ResizeObserver': 1 argument required",
  ]) {
    const event = exception(value, "TypeError");
    expect(dropUnfixableNoise(event)).toBe(event);
  }
});

test("keeps real exceptions", () => {
  const event = exception("Cannot read properties of undefined", "TypeError");
  expect(dropUnfixableNoise(event)).toBe(event);
});

test("keeps non-exception events and a null event", () => {
  const pageview = {
    uuid: "00000000-0000-0000-0000-000000000001",
    event: "$pageview",
    properties: {
      $exception_list: [
        { value: "Object Not Found Matching Id:1, MethodName:update" },
      ],
    },
  } as CaptureResult;
  expect(dropUnfixableNoise(pageview)).toBe(pageview);
  expect(dropUnfixableNoise(null)).toBeNull();
});
