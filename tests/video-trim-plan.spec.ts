import { expect, test } from "@playwright/test";

import {
  decideTrim,
  remuxedFileName,
  remuxedJobWindow,
} from "@/lib/video/trim-plan";

/**
 * Whether the browser cuts a video before upload. Every "skip" uploads the
 * original with the window the wizard wrote, which is the pre-trim behaviour,
 * so the rules only decide cost — never whether the upload happens.
 */

const base = {
  startSeconds: 600,
  endSeconds: 3600,
  sourceDurationSeconds: 5400,
  fileSizeBytes: 5_000_000_000,
  opfsAvailable: true,
  quotaFreeBytes: 50_000_000_000,
};

test("a narrower window is remuxed", () => {
  expect(decideTrim(base)).toEqual({
    kind: "remux",
    startSeconds: 600,
    endSeconds: 3600,
  });
});

test("the whole clip, within half a second at either end, is not", () => {
  expect(
    decideTrim({ ...base, startSeconds: 0.3, endSeconds: 5399.8 }),
  ).toEqual({ kind: "skip", reason: "whole-clip" });
  expect(decideTrim({ ...base, startSeconds: 0, endSeconds: 5400 })).toEqual({
    kind: "skip",
    reason: "whole-clip",
  });
  expect(decideTrim({ ...base, startSeconds: 0, endSeconds: 5398 }).kind).toBe(
    "remux",
  );
});

test("no private file system means upload the original", () => {
  expect(decideTrim({ ...base, opfsAvailable: false })).toEqual({
    kind: "skip",
    reason: "no-opfs",
  });
});

test("quota is checked against the kept share of the file, and unknown quota is allowed", () => {
  // Keeping 3000 of 5400 seconds of a 5 GB file needs ~2.9 GB.
  expect(decideTrim({ ...base, quotaFreeBytes: 2_000_000_000 })).toEqual({
    kind: "skip",
    reason: "no-quota",
  });
  expect(decideTrim({ ...base, quotaFreeBytes: 3_500_000_000 }).kind).toBe(
    "remux",
  );
  expect(decideTrim({ ...base, quotaFreeBytes: null }).kind).toBe("remux");
});

test("an end past the clip is clamped", () => {
  expect(decideTrim({ ...base, endSeconds: 9999 })).toEqual({
    kind: "remux",
    startSeconds: 600,
    endSeconds: 5400,
  });
  expect(decideTrim({ ...base, startSeconds: 0, endSeconds: 9999 })).toEqual({
    kind: "skip",
    reason: "whole-clip",
  });
});

test("the job window for a cut file starts at 0", () => {
  expect(remuxedJobWindow(3000.4)).toEqual({
    start_time_seconds: 0,
    end_time_seconds: 3000.4,
    billable_seconds: 3001,
  });
});

test("the cut is named as an MP4", () => {
  expect(remuxedFileName("Match vs Stepanov.MOV")).toBe(
    "Match vs Stepanov.trimmed.mp4",
  );
  expect(remuxedFileName("noext")).toBe("noext.trimmed.mp4");
});
