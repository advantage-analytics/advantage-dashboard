import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_FORMATS,
  BufferSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  NullTarget,
  Output,
} from "mediabunny";

import { CONVERSION_TRACKS } from "@/lib/video/trim-plan";

/**
 * The browser cut before upload (trim.worker.ts) fails as a whole when
 * Mediabunny discards any video or audio track, and the original is uploaded
 * uncut and unconverted. An iPhone 17 Pro records a second, spatial-audio
 * track Mediabunny can't read, so every such upload went up raw (Jerry Shi v
 * JR, 2026-11-25: 5.3 GB of HDR HEVC, its trim window ignored).
 *
 * extra-audio.mov is that shape in 39 KB: H.264 + AAC + a second audio track
 * in a codec Mediabunny can't read. These run the worker's own Conversion
 * settings against it.
 */
const FIXTURE = resolve(__dirname, "fixtures/match-video/extra-audio.mov");

async function discardedTracks(tracks: "all" | "primary") {
  const bytes = readFileSync(FIXTURE);
  const conversion = await Conversion.init({
    input: new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS }),
    output: new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new NullTarget(),
    }),
    tracks,
    trim: { start: 0.2, end: 0.8 },
    copy: { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" },
    showWarnings: false,
  });
  return {
    valid: conversion.isValid,
    discarded: conversion.discardedTracks.map(
      (d) => `${d.track.type}:${d.reason}`,
    ),
  };
}

test.describe("upload cut track selection", () => {
  test("the fixture reproduces the failure when every track is converted", async () => {
    // Without this the spec below would pass on a fixture that proves nothing.
    const all = await discardedTracks("all");
    expect(all.discarded).toEqual(["audio:unknown_source_codec"]);
  });

  test("the worker converts only the primary tracks, so nothing is discarded", async () => {
    expect(CONVERSION_TRACKS).toBe("primary");
    const primary = await discardedTracks(CONVERSION_TRACKS);
    expect(primary).toEqual({ valid: true, discarded: [] });
  });

  test("the worker passes that selection to its Conversion", () => {
    // The worker runs only in a browser; this keeps the constant above wired
    // to the call it exists for.
    const worker = readFileSync(
      resolve(__dirname, "../src/lib/video/trim.worker.ts"),
      "utf8",
    );
    expect(worker).toMatch(
      /Conversion\.init\(\{[^}]*tracks: CONVERSION_TRACKS,/,
    );
  });
});
