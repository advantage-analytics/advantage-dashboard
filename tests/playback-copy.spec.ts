import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  parsePlaybackReport,
  playbackColumns,
  playbackKeyFor,
  verifyPlaybackSignature,
} from "@/lib/services/match-video/playback-copy";

/**
 * The Azure playback worker's reports. The key a report names must be the
 * one derived from the upload's, so a report can only point a job at its
 * own copy, and only a body signed with the shared secret is read at all.
 */

test("the copy's key mirrors the upload's, always .mp4", () => {
  expect(playbackKeyFor("videos/u1/m1/original.mp4")).toBe(
    "playback/u1/m1/original.mp4",
  );
  expect(playbackKeyFor("videos/u1/m1/original.mov")).toBe(
    "playback/u1/m1/original.mp4",
  );
  expect(playbackKeyFor("trimmed/u1/m1/x.mp4")).toBeNull();
  expect(playbackKeyFor("videos/u1/original.mp4")).toBeNull();
  expect(playbackKeyFor("videos/u1/m1/../x/original.mp4")).toBeNull();
});

test("only a body signed with the secret passes", () => {
  const body = '{"sourceKey":"videos/u/m/original.mp4","status":"processing"}';
  const good = createHmac("sha256", "s3cret").update(body).digest("hex");
  expect(verifyPlaybackSignature(body, good, "s3cret")).toBe(true);
  expect(verifyPlaybackSignature(body, good, "other")).toBe(false);
  expect(verifyPlaybackSignature(body + " ", good, "s3cret")).toBe(false);
  expect(verifyPlaybackSignature(body, null, "s3cret")).toBe(false);
  expect(verifyPlaybackSignature(body, "zz", "s3cret")).toBe(false);
});

test("a ready report must name the derived key", () => {
  const sourceKey = "videos/u/m/original.mov";
  expect(
    parsePlaybackReport({
      sourceKey,
      status: "ready",
      playbackKey: "playback/u/m/original.mp4",
    }),
  ).toEqual({
    sourceKey,
    status: "ready",
    playbackKey: "playback/u/m/original.mp4",
    error: null,
  });
  // Any other blob — someone else's upload, the vendor copy — is refused.
  expect(
    parsePlaybackReport({
      sourceKey,
      status: "ready",
      playbackKey: "videos/other/m/original.mp4",
    }),
  ).toBeNull();
  expect(parsePlaybackReport({ sourceKey, status: "done" })).toBeNull();
  expect(
    parsePlaybackReport({ sourceKey: "trimmed/u/m/j.mp4", status: "failed" }),
  ).toBeNull();
});

test("processing and failed keep a copy already made; ready sets it", () => {
  const sourceKey = "videos/u/m/original.mp4";
  const failed = parsePlaybackReport({
    sourceKey,
    status: "failed",
    error: "x".repeat(900),
  })!;
  expect(playbackColumns(failed)).toEqual({
    playback_status: "failed",
    playback_error: "x".repeat(500),
  });
  expect(
    playbackColumns(parsePlaybackReport({ sourceKey, status: "processing" })!),
  ).toEqual({ playback_status: "processing", playback_error: null });
  expect(
    playbackColumns(
      parsePlaybackReport({
        sourceKey,
        status: "ready",
        playbackKey: "playback/u/m/original.mp4",
      })!,
    ),
  ).toEqual({
    playback_status: "ready",
    playback_error: null,
    playback_object_key: "playback/u/m/original.mp4",
  });
});
