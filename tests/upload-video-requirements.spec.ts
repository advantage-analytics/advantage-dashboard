/**
 * Advantage Intelligence video requirements — boundary fixtures.
 *
 * These drive the validator's thresholds from constructed `VideoProbe` values
 * rather than real clips. That is not a shortcut: `VideoProbe` is a plain
 * interface, there is no ffmpeg on the build machines, and the repository holds
 * no video fixtures — a spec that had to decode a file could not run in CI.
 * What is therefore NOT covered here is `probeVideo()` itself reading a real
 * file; only the accept/reject decision made from what it reports.
 *
 * Every number asserted below is read from `splitstep/config.ts`, so a
 * renegotiated limit moves the test with the constant instead of leaving a
 * stale literal behind. The provider-documentation side of each boundary is
 * named in the test titles — see
 * work/upload-flow-refinements/01_brief/output/brief.md §"Also consulted".
 */

import { expect, test } from "@playwright/test";

import {
  checkVideoFileBasics,
  evaluateVideoProbe,
} from "@/lib/services/upload/validators/splitstep-validator";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_BYTES,
  MIN_TRIM_DURATION_SECONDS,
  MIN_VIDEO_FPS,
  MIN_VIDEO_HEIGHT,
  MIN_VIDEO_WIDTH,
  PROVIDER_DISPLAY_NAME,
  RECOMMENDED_VIDEO_FPS,
} from "@/lib/services/splitstep/config";
import type { VideoProbe } from "@/lib/video/probe";

/** A file that clears every check, so each test varies exactly one field. */
function probe(overrides: Partial<VideoProbe> = {}): VideoProbe {
  return {
    width: MIN_VIDEO_WIDTH,
    height: MIN_VIDEO_HEIGHT,
    durationSeconds: 45 * 60,
    fps: RECOMMENDED_VIDEO_FPS,
    mimeType: "video/mp4",
    sizeBytes: 3_000_000_000,
    ...overrides,
  };
}

test.describe("size boundary — the guide's 'under 8,000,000,000 bytes'", () => {
  test("accepts the largest permitted file and refuses the first byte over", () => {
    expect(
      checkVideoFileBasics({ name: "m.mp4", size: MAX_VIDEO_SIZE_BYTES }),
    ).toBeNull();

    const over = checkVideoFileBasics({
      name: "m.mp4",
      size: MAX_VIDEO_SIZE_BYTES + 1,
    });
    expect(over?.success).toBe(false);
    expect(over?.error).toContain("8.0 GB");
  });

  test("a refusal names two different figures the user can act on", () => {
    // Regression: rendered in binary GB, an 8.1e9-byte file read "Video is
    // 7.5 GB. The maximum is 7.5 GB." — the same number twice, and neither of
    // them the "Under 8 GB" shown beside the drop zone.
    const result = checkVideoFileBasics({ name: "m.mp4", size: 8_100_000_000 });
    expect(result?.error).toContain("Video is 8.1 GB");
    expect(result?.error).toContain("maximum is 8.0 GB");
  });
});

test.describe("container", () => {
  test("accepts every documented container, case-insensitively", () => {
    for (const ext of ACCEPTED_VIDEO_EXTENSIONS) {
      expect(
        checkVideoFileBasics({ name: `match${ext}`, size: 10 }),
      ).toBeNull();
      expect(
        checkVideoFileBasics({ name: `MATCH${ext.toUpperCase()}`, size: 10 }),
      ).toBeNull();
    }
  });

  test("MOV is accepted — the MP4 preference is not enforced as a rule", () => {
    expect(checkVideoFileBasics({ name: "match.mov", size: 10 })).toBeNull();
  });

  test("an unbuildable container is refused before any decode, and says what to send", () => {
    const result = checkVideoFileBasics({ name: "match.avi", size: 10 });
    expect(result?.success).toBe(false);
    for (const ext of ACCEPTED_VIDEO_EXTENSIONS) {
      expect(result?.error).toContain(ext);
    }
  });
});

test.describe("resolution boundary — the guide's 1080p minimum", () => {
  test("accepts exactly 1080p and refuses one pixel short on either axis", () => {
    expect(evaluateVideoProbe(probe()).success).toBe(true);

    for (const short of [
      { width: MIN_VIDEO_WIDTH - 1 },
      { height: MIN_VIDEO_HEIGHT - 1 },
    ]) {
      const result = evaluateVideoProbe(probe(short));
      expect(result.success).toBe(false);
      expect(result.error).toContain("1080p");
      // The refusal carries the probe, so the UI can show what was measured.
      expect(result.details?.video).toBeTruthy();
    }
  });

  test("a 720p phone clip is refused with its own dimensions quoted", () => {
    const result = evaluateVideoProbe(probe({ width: 1280, height: 720 }));
    expect(result.error).toContain("1280×720");
  });
});

test.describe("frame-rate boundary", () => {
  test("29.97 is accepted, whether or not it arrived already rounded", () => {
    // The guide's specification accepts 29.97; its error table describes
    // rejection below 29.9. The contradiction is left to the vendor — what is
    // settled is that 29.97 itself passes, at both layers.
    for (const fps of [29.97, 30]) {
      expect(evaluateVideoProbe(probe({ fps })).success).toBe(true);
    }
  });

  test("a rate genuinely under the floor is fatal and quotes the file's own rate", () => {
    const result = evaluateVideoProbe(probe({ fps: 24 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain("24 fps");
    expect(result.error).toContain(`${MIN_VIDEO_FPS} fps`);
  });

  test("meeting the floor but not the preference warns instead of blocking", () => {
    const result = evaluateVideoProbe(probe({ fps: MIN_VIDEO_FPS }));
    expect(result.success).toBe(true);
    expect(result.warnings?.[0]).toContain(`${RECOMMENDED_VIDEO_FPS} fps`);
  });

  test("the preferred rate passes with nothing to say", () => {
    expect(evaluateVideoProbe(probe()).warnings).toBeUndefined();
  });
});

test.describe("unknown metadata stays distinct from a known violation", () => {
  test("an unmeasurable frame rate warns, does not refuse, and does not read as a pass", () => {
    const result = evaluateVideoProbe(probe({ fps: null }));

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    const warning = result.warnings?.[0] ?? "";
    expect(warning).toContain("can't measure");
    expect(warning).toContain(`${MIN_VIDEO_FPS} fps`);
    // Names who refuses the file if the guess is wrong — otherwise silence on
    // an unchecked requirement reads as permission.
    expect(warning).toContain(PROVIDER_DISPLAY_NAME);
    expect(warning).not.toContain("SplitStep");
  });

  test("an unknown duration is not treated as a too-short clip", () => {
    // `probeVideo` reports 0 for a duration the browser would not give (a
    // stream-ish MP4 with no usable header). Zero is "unknown", not "0s".
    expect(evaluateVideoProbe(probe({ durationSeconds: 0 })).success).toBe(
      true,
    );
  });

  test("unknown frame rate does not suppress a violation the file does show", () => {
    const result = evaluateVideoProbe(
      probe({ fps: null, width: 640, height: 360 }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("1080p");
  });
});

test.describe("duration boundary", () => {
  test("accepts the shortest permitted clip and refuses one second under", () => {
    expect(
      evaluateVideoProbe(probe({ durationSeconds: MIN_TRIM_DURATION_SECONDS }))
        .success,
    ).toBe(true);

    const short = evaluateVideoProbe(
      probe({ durationSeconds: MIN_TRIM_DURATION_SECONDS - 1 }),
    );
    expect(short.success).toBe(false);
    expect(short.error).toContain("too short");
  });
});
