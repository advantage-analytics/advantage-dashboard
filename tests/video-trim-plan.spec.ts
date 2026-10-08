import { expect, test } from "@playwright/test";

import { normaliseReason } from "@/lib/match-video/playback-format";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/services/splitstep/config";
import {
  decideTrim,
  remuxedFileName,
  remuxedJobWindow,
  TRANSCODE_BITRATE_30FPS,
  TRANSCODE_BITRATE_60FPS,
  transcodeVideoBitrate,
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

/**
 * The one re-encode. A file that is not 1080p-or-less H.264 plays for whoever
 * uploaded it and raises a media error for a viewer without that decoder — the
 * Rhodri v Bao match was 4K HEVC at 60 fps.
 */

test("only H.264 at 1080p or less is left as it was shot", () => {
  const shape = (videoCodec: string | null, w: number, h: number) =>
    normaliseReason({ videoCodec, codedWidth: w, codedHeight: h });

  expect(shape("avc", 1920, 1080)).toBeNull();
  expect(shape("avc", 1280, 720)).toBeNull();
  // Portrait 1080p: the short side is what counts.
  expect(shape("avc", 1080, 1920)).toBeNull();
  // 1080 rows coded as 1088 is still 1080p.
  expect(shape("avc", 1920, 1088)).toBeNull();
  // A codec the container does not name gives an encoder nothing to work from.
  expect(shape(null, 1920, 1080)).toBeNull();

  expect(shape("hevc", 1920, 1080)).toBe("codec");
  expect(shape("avc", 3840, 2160)).toBe("resolution");
  expect(shape("hevc", 3840, 2160)).toBe("codec-and-resolution");
  expect(shape("av1", 2160, 3840)).toBe("codec-and-resolution");
});

test("a file that needs it is re-encoded, even when the window is the whole clip", () => {
  const hevc = { ...base, normalise: "codec" as const, frameRate: 60 };

  expect(decideTrim(hevc)).toEqual({
    kind: "transcode",
    startSeconds: 600,
    endSeconds: 3600,
    videoBitrate: TRANSCODE_BITRATE_60FPS,
  });
  // Handles left near the ends: still re-encoded, and from where they were
  // left, because the caller's clocks are placed from the start it asked for.
  expect(
    decideTrim({ ...hevc, startSeconds: 0.3, endSeconds: 5399.8 }),
  ).toEqual({
    kind: "transcode",
    startSeconds: 0.3,
    endSeconds: 5399.8,
    videoBitrate: TRANSCODE_BITRATE_60FPS,
  });
  // A file already in the safe shape keeps every decision it had before.
  expect(decideTrim({ ...base, normalise: null, frameRate: 60 })).toEqual(
    decideTrim(base),
  );
});

test("the re-encode's bitrate follows the frame rate", () => {
  expect(transcodeVideoBitrate(29.97)).toBe(TRANSCODE_BITRATE_30FPS);
  expect(transcodeVideoBitrate(30)).toBe(TRANSCODE_BITRATE_30FPS);
  expect(transcodeVideoBitrate(null)).toBe(TRANSCODE_BITRATE_30FPS);
  expect(transcodeVideoBitrate(59.94)).toBe(TRANSCODE_BITRATE_60FPS);
});

test("a re-encode's quota is its own output, not a share of the source", () => {
  // 18 minutes of 4K HEVC is ~6 GB; at 8 Mbps the 1080p copy is ~1.2 GB.
  const clip = {
    startSeconds: 0,
    endSeconds: 1089,
    sourceDurationSeconds: 1089,
    fileSizeBytes: 5_900_000_000,
    opfsAvailable: true,
    normalise: "codec-and-resolution" as const,
    frameRate: 60,
  };
  expect(decideTrim({ ...clip, quotaFreeBytes: 1_500_000_000 }).kind).toBe(
    "transcode",
  );
  expect(decideTrim({ ...clip, quotaFreeBytes: 800_000_000 })).toEqual({
    kind: "skip",
    reason: "no-quota",
  });
  expect(decideTrim({ ...clip, quotaFreeBytes: null }).kind).toBe("transcode");
  expect(
    decideTrim({ ...clip, quotaFreeBytes: null, opfsAvailable: false }),
  ).toEqual({
    kind: "skip",
    reason: "no-opfs",
  });
});

test("a very long match gives up bitrate so the re-encode still fits the upload", () => {
  const long = (hours: number) =>
    decideTrim({
      startSeconds: 0,
      endSeconds: hours * 3600,
      sourceDurationSeconds: hours * 3600,
      fileSizeBytes: 7_900_000_000,
      opfsAvailable: true,
      quotaFreeBytes: null,
      normalise: "codec",
      frameRate: 60,
    });

  const ordinary = long(1.5);
  expect(ordinary.kind === "transcode" && ordinary.videoBitrate).toBe(
    TRANSCODE_BITRATE_60FPS,
  );

  const four = long(4);
  if (four.kind !== "transcode") throw new Error("expected a transcode");
  expect(four.videoBitrate).toBeLessThan(TRANSCODE_BITRATE_60FPS);
  // Video plus audio, over four hours, stays under the 8 GB limit.
  expect(((four.videoBitrate + 320_000) / 8) * 4 * 3600).toBeLessThan(
    MAX_VIDEO_SIZE_BYTES,
  );
});

test("a browser that cannot re-encode still cuts a window, and says why a whole clip is not", () => {
  const stuck = {
    ...base,
    normalise: "codec" as const,
    frameRate: 60,
    canTranscode: false,
  };
  // A trimmed window: the copy-only cut it has always had, not the whole file.
  expect(decideTrim(stuck)).toEqual({
    kind: "remux",
    startSeconds: 600,
    endSeconds: 3600,
  });
  expect(decideTrim({ ...stuck, startSeconds: 0, endSeconds: 5400 })).toEqual({
    kind: "skip",
    reason: "no-encoder",
  });
});
