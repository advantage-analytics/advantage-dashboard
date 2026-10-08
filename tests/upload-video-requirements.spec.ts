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
  effectiveFps,
  evaluateVideoProbe,
  formatProbeFps,
} from "@/lib/services/upload/validators/splitstep-validator";
import { videoExtensionFor } from "@/lib/services/splitstep/object-keys";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_BYTES,
  MIN_CONTAINER_AVERAGE_FPS,
  MIN_TRIM_DURATION_SECONDS,
  MIN_VIDEO_FPS,
  MIN_VIDEO_HEIGHT,
  MIN_VIDEO_WIDTH,
  PROVIDER_DISPLAY_NAME,
  RECOMMENDED_CONTAINER_AVERAGE_FPS,
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
    const result = checkVideoFileBasics({ name: "match.txt", size: 10 });
    expect(result?.success).toBe(false);
    for (const ext of ACCEPTED_VIDEO_EXTENSIONS) {
      expect(result?.error).toContain(ext);
    }
  });
});

test.describe("widened container allowlist — vendor accepts 'any container ffmpeg can decode'", () => {
  // The vendor's guide (https://splitstep.ai/api-docs.html) accepts any
  // container ffmpeg can decode, with MP4 (H.264) merely preferred. That set
  // is not enumerable, so ACCEPTED_VIDEO_EXTENSIONS is a practical allowlist
  // of containers a camera or phone actually produces — widened here past
  // mp4/mov to cover common phone and camera exports.
  const expectedWidenedSet = [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"];

  test("the allowlist covers exactly the practical camera/phone containers", () => {
    expect([...ACCEPTED_VIDEO_EXTENSIONS].sort()).toEqual(
      [...expectedWidenedSet].sort(),
    );
  });

  for (const ext of [".m4v", ".avi", ".mkv", ".webm"]) {
    test(`${ext} clears the pick-time validator and builds a storage key`, () => {
      const fileName = `match${ext}`;

      // Accepted at the pick-time gate...
      expect(checkVideoFileBasics({ name: fileName, size: 10 })).toBeNull();

      // ...and videoExtensionFor() — which the upload-url route relies on to
      // build the blob key — agrees rather than throwing. These two must
      // move together: widening one without the other is exactly the
      // pick-time-accept/upload-time-400 failure this fix removes.
      expect(videoExtensionFor(fileName)).toBe(ext);
    });
  }

  test("an unknown extension still throws from videoExtensionFor(), not just the validator", () => {
    expect(() => videoExtensionFor("match.txt")).toThrow(
      /Unsupported video container/,
    );
  });

  test("a renamed unknown extension (.txt) is still refused at pick time", () => {
    // "Anything ffmpeg can decode" is not enumerable — a genuinely
    // unrecognised container still fails fast, before any bytes move.
    const result = checkVideoFileBasics({ name: "notes.txt", size: 10 });
    expect(result?.success).toBe(false);
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

  test("a whole-track average under 29.5 is refused, naming the average", () => {
    // A variable-rate MP4 that opens at 30 to the sample but averages well
    // under the floor over the whole track.
    const input = probe({ fps: 30, averageFps: 29.2 });
    const result = evaluateVideoProbe(input);
    expect(result.success).toBe(false);
    const error = result.error ?? "";
    expect(error).toContain("29.2 fps");
    expect(error).toContain("variable");
    expect(error).toContain(PROVIDER_DISPLAY_NAME);
    expect(error).toContain(`${MIN_CONTAINER_AVERAGE_FPS} fps`);
    expect(error).toContain("constant 30 fps");
    expect(error).not.toMatch(/splitstep|swingvision/i);
    expect(formatProbeFps(input)).toBe("29.2 fps");
  });

  test("the three tiers: refused under 29.5, warned up to 29.97, silent from 29.97", () => {
    // The constants are the spec; the literals are here so a silent change
    // to either one fails this test.
    expect(MIN_CONTAINER_AVERAGE_FPS).toBe(29.5);
    expect(RECOMMENDED_CONTAINER_AVERAGE_FPS).toBe(29.97);

    // 30000/1001 is 29.97003; the reader rounds to two decimals, so genuine
    // NTSC reads 29.97 and passes with nothing to say about its average.
    const ntsc = evaluateVideoProbe(probe({ fps: 30, averageFps: 29.97 }));
    expect(ntsc.success).toBe(true);
    expect(ntsc.warnings?.join(" ") ?? "").not.toContain("averages");

    // Jobs 45ff4bd7 (29.94) and b74a1e04 (29.95) live here, as do the four
    // phone recordings measured 2026-09-29 (29.74–29.94): accepted with one
    // warning that names the average and the vendor's recommended rate — and
    // not a second fps line on top of it.
    for (const averageFps of [29.96, 29.95, 29.94, 29.8, 29.74, 29.5]) {
      const input = probe({ fps: 30, averageFps });
      const result = evaluateVideoProbe(input);
      expect(result.success, `${averageFps}`).toBe(true);
      expect(result.warnings, `${averageFps}`).toHaveLength(1);
      const warning = result.warnings?.[0] ?? "";
      expect(warning).toContain(`${averageFps} fps`);
      expect(warning).toContain("variable");
      expect(warning).toContain(PROVIDER_DISPLAY_NAME);
      expect(warning).toContain(`${RECOMMENDED_CONTAINER_AVERAGE_FPS} fps`);
      expect(warning).toContain("still analyse");
      expect(warning).not.toContain(`${RECOMMENDED_VIDEO_FPS} fps`);
      expect(warning).not.toMatch(/splitstep|swingvision/i);
      expect(formatProbeFps(input)).toBe(`${averageFps} fps`);
    }

    expect(
      evaluateVideoProbe(probe({ fps: 30, averageFps: 29.49 })).success,
    ).toBe(false);
  });

  test("constant-rate footage and an unknown average are never refused on the average", () => {
    const cases: Array<[Partial<VideoProbe>, string]> = [
      [{ fps: 30, averageFps: 29.97 }, "30 fps"],
      [{ fps: 30, averageFps: 30 }, "30 fps"],
      [{ fps: 60, averageFps: 59.94 }, "60 fps"],
      [{ fps: 30, averageFps: null }, "30 fps"],
      [{ fps: 30 }, "30 fps"],
    ];
    for (const [overrides, shown] of cases) {
      const input = probe(overrides);
      const result = evaluateVideoProbe(input);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(formatProbeFps(input)).toBe(shown);
    }
  });

  test("a low average is refused whatever the sample read", () => {
    expect(evaluateVideoProbe(probe({ fps: 24, averageFps: 24 })).success).toBe(
      false,
    );
    expect(evaluateVideoProbe(probe({ fps: 30, averageFps: 24 })).success).toBe(
      false,
    );
  });

  test("a known average overrides a low sample", () => {
    // Emon_RohanMurali_Harvard.mp4, 2026-09-29: whole-track average 29.94,
    // but the 20-frame sample at the start of the file read 29.2 (one dropped
    // frame) and the wizard refused it. Twenty frames are not a frame rate;
    // the container index covers every frame and decides.
    const p = probe({ fps: 29.2, averageFps: 29.94 });
    const result = evaluateVideoProbe(p);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("29.94 fps");
    expect(formatProbeFps(p)).toBe("29.94 fps");
    expect(effectiveFps(p)).toBe(30);

    // A constant-rate file the browser merely stuttered on: nothing to say.
    const steady = probe({ fps: 29.2, averageFps: 30 });
    expect(evaluateVideoProbe(steady).success).toBe(true);
    expect(evaluateVideoProbe(steady).warnings?.join(" ") ?? "").not.toContain(
      "29.2",
    );
    expect(formatProbeFps(steady)).toBe("30 fps");
  });

  test("with no average, the sample still refuses under the floor", () => {
    // Another container, or the read timed out: the sample is all there is.
    const result = evaluateVideoProbe(probe({ fps: 29.2, averageFps: null }));
    expect(result.success).toBe(false);
    expect(result.error).toContain("29.2 fps");
    expect(result.error).toContain(`${MIN_VIDEO_FPS} fps`);
  });

  // Browsers without requestVideoFrameCallback (Firefox) report no sampled
  // rate, but the container read still works — so the average stands in.
  test("with no sampled rate, a sub-29.5 average is still refused", () => {
    const p = probe({ fps: null, averageFps: 29.2 });
    const result = evaluateVideoProbe(p);

    expect(result.success).toBe(false);
    expect(result.error).toContain("29.2 fps");
    expect(result.error).toContain("constant 30 fps");
    expect(formatProbeFps(p)).toBe("29.2 fps");
  });

  test("with no sampled rate, an average in the warning band is accepted with the one warning", () => {
    const p = probe({ fps: null, averageFps: 29.94 });
    const result = evaluateVideoProbe(p);

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("29.94 fps");
    expect(result.warnings?.[0]).not.toContain("can't measure");
    expect(formatProbeFps(p)).toBe("29.94 fps");
  });

  test("a known average under the floor refuses even when the sample reads 30", () => {
    // A variable-rate MP4 that opens at 30 but averages 24 — the vendor
    // rejects it, so the verdict must not depend on whether the browser
    // could sample.
    const result = evaluateVideoProbe(probe({ fps: 30, averageFps: 24 }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("24 fps");
  });

  test("with no sampled rate, an average under the floor is refused", () => {
    const result = evaluateVideoProbe(probe({ fps: null, averageFps: 24 }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("24 fps");
  });

  test("with no sampled rate, a constant 29.97 average passes and reads as 30", () => {
    const p = probe({ fps: null, averageFps: 29.97 });
    const result = evaluateVideoProbe(p);

    expect(result.success).toBe(true);
    expect(result.warnings?.join(" ") ?? "").not.toContain("can't measure");
    expect(formatProbeFps(p)).toBe("30 fps");
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

test.describe("a file not every browser can play is converted, never refused", () => {
  test("1080p H.264, or a codec we could not read, says nothing", () => {
    expect(
      evaluateVideoProbe(probe({ videoCodec: "avc" })).warnings,
    ).toBeUndefined();
    expect(evaluateVideoProbe(probe()).warnings).toBeUndefined();
  });

  test("a phone's 4K HEVC is accepted and the uploader is told it will be converted", () => {
    const result = evaluateVideoProbe(
      probe({
        width: 3840,
        height: 2160,
        videoCodec: "hevc",
        canConvert: true,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("above 1080p and isn't H.264");
    expect(result.warnings?.[0]).toContain("converted to 1080p H.264");
    expect(result.warnings?.[0]).toContain("Keep the tab open");
  });

  test("each reason is named on its own", () => {
    expect(
      evaluateVideoProbe(probe({ videoCodec: "hevc", canConvert: true }))
        .warnings?.[0],
    ).toMatch(/^This video isn't H\.264, so/);
    expect(
      evaluateVideoProbe(
        probe({
          width: 3840,
          height: 2160,
          videoCodec: "avc",
          canConvert: true,
        }),
      ).warnings?.[0],
    ).toMatch(/^This video is above 1080p, so/);
  });

  test("a container we could not read is promised nothing", () => {
    // The worker reads the same container: unread here means unread there,
    // and the file would go up as shot.
    expect(
      evaluateVideoProbe(probe({ width: 3840, height: 2160 })).warnings,
    ).toBeUndefined();
  });

  test("a browser that cannot convert still uploads, and says what that costs", () => {
    const result = evaluateVideoProbe(
      probe({ videoCodec: "hevc", canConvert: false }),
    );
    expect(result.success).toBe(true);
    expect(result.warnings?.[0]).toContain("this browser can't convert it");
    expect(result.warnings?.[0]).toContain("export it as 1080p H.264");
    expect(result.warnings?.[0]).not.toContain("will be converted");
  });
});
