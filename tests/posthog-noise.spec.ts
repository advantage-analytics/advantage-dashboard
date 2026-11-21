import { expect, test } from "@playwright/test";
import type { CaptureResult } from "posthog-js";

import { dropUnfixableNoise } from "../src/lib/posthog-noise";

/**
 * The posthog-js `before_send` filter in instrumentation-client.ts drops the
 * Microsoft link-scanner rejection (PostHog issue 01a10378) and the browser's
 * ResizeObserver loop notices (PostHog issue 01a1768a), a link scanner's
 * failed chunk loads (PostHog issue 01a1cc8b), and nothing else.
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

function chunkLoad(
  screen: [number, number],
  viewport: [number, number],
  device = "Desktop",
) {
  const event = exception(
    "Failed to load chunk /_next/static/immutable/chunks/3evqr7gmv5pog.js from module 361972",
    "ChunkLoadError",
  );
  Object.assign(event.properties, {
    $device_type: device,
    $screen_width: screen[0],
    $screen_height: screen[1],
    $viewport_width: viewport[0],
    $viewport_height: viewport[1],
  });
  return event;
}

test("drops a failed chunk in a link scanner's full-screen sandbox", () => {
  expect(dropUnfixableNoise(chunkLoad([1920, 1080], [1920, 1080]))).toBeNull();
});

test("keeps a person's failed chunk in a normal window", () => {
  const event = chunkLoad([1920, 1080], [1920, 947]);
  expect(dropUnfixableNoise(event)).toBe(event);
});

test("keeps a failed chunk on a phone that fills its screen", () => {
  const event = chunkLoad([390, 844], [390, 844], "Mobile");
  expect(dropUnfixableNoise(event)).toBe(event);
});

test("keeps other errors from a full-screen desktop", () => {
  const event = chunkLoad([1920, 1080], [1920, 1080]);
  event.properties.$exception_list = [
    { type: "TypeError", value: "Cannot read properties of undefined" },
  ];
  expect(dropUnfixableNoise(event)).toBe(event);
});

test("keeps a failed chunk when the window size is unknown", () => {
  const event = exception("Failed to load chunk /x.js", "ChunkLoadError");
  event.properties.$device_type = "Desktop";
  expect(dropUnfixableNoise(event)).toBe(event);
});
