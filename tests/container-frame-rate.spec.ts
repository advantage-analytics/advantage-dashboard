/**
 * `readAverageFrameRate()` — whole-track average frame rate from the container.
 *
 * Fixtures are muxed in the spec with mediabunny's own `Output`, so no binary
 * video is committed. The packets are synthetic: this function reads only the
 * container's index (timestamps and durations), never decodes, so the payload
 * bytes do not need to be a real bitstream. VP9 is used for every container
 * because its codec configuration box is derived from the codec string alone —
 * H.264 would need a hand-built `avcC` decoder description, VP9 does not.
 *
 * mediabunny's `averagePacketRate` is `count / (lastTimestamp + lastDuration -
 * firstTimestamp)`; the fixtures below are built from that formula.
 *
 * Expect a "Mediabunny was loaded twice" warning in the run: this spec's static
 * import resolves to mediabunny's CJS bundle, the module's dynamic
 * `import("mediabunny")` to its ESM build. Only bytes cross between the two
 * (the muxed Blob), so the duplicate is harmless here; the app bundles one.
 */

import { expect, test } from "@playwright/test";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type OutputFormat,
} from "mediabunny";

import {
  readAverageFrameRate,
  withDeadline,
} from "@/lib/video/container-frame-rate";

type Container = "mp4" | "mov" | "webm";

function formatFor(container: Container): OutputFormat {
  if (container === "mov") return new MovOutputFormat();
  if (container === "webm") return new WebMOutputFormat();
  return new Mp4OutputFormat();
}

/**
 * Mux one video track whose packet i starts at `timestamps[i]` and lasts until
 * the next packet (the last one lasts `lastDuration`).
 */
async function buildVideo(
  container: Container,
  timestamps: number[],
  lastDuration: number,
): Promise<Blob> {
  const target = new BufferTarget();
  const output = new Output({ format: formatFor(container), target });
  const source = new EncodedVideoPacketSource("vp9");
  output.addVideoTrack(source);
  await output.start();

  const payload = new Uint8Array(64).fill(0x5a);
  for (let i = 0; i < timestamps.length; i++) {
    const start = timestamps[i];
    const end =
      i + 1 < timestamps.length ? timestamps[i + 1] : start + lastDuration;
    const packet = new EncodedPacket(
      payload,
      i === 0 ? "key" : "delta",
      start,
      end - start,
    );
    await source.add(
      packet,
      i === 0
        ? {
            decoderConfig: {
              codec: "vp09.00.10.08",
              codedWidth: 1280,
              codedHeight: 720,
            },
          }
        : undefined,
    );
  }
  await output.finalize();
  if (!target.buffer) throw new Error("muxer produced no buffer");
  return new Blob([target.buffer]);
}

/** `count` packets spaced exactly `spacing` seconds apart. */
function evenTimestamps(count: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => i * spacing);
}

test.describe("readAverageFrameRate", () => {
  test("MP4 of 300 packets at 1001/30000 s reads 29.97", async () => {
    const spacing = 1001 / 30000;
    const file = await buildVideo("mp4", evenTimestamps(300, spacing), spacing);
    const fps = await readAverageFrameRate(file);
    expect(fps).not.toBeNull();
    expect(Math.abs((fps as number) - 29.97)).toBeLessThanOrEqual(0.01);
  });

  test("MP4 at 1/30 s with periodic doubled gaps reads 29.80", async () => {
    // 300 packets at 1/30 s, but the gap before every 100th packet is doubled
    // (two doubled gaps). Span = (299 + 2) gaps + 1 last duration = 302/30 s,
    // so the average is 300 / (302/30) = 29.801 fps — a VFR file whose first
    // 20 frames alone would read a clean 30.
    const spacing = 1 / 30;
    const timestamps: number[] = [];
    let t = 0;
    for (let i = 0; i < 300; i++) {
      if (i > 0) t += i % 100 === 0 ? 2 * spacing : spacing;
      timestamps.push(t);
    }
    const file = await buildVideo("mp4", timestamps, spacing);
    const fps = await readAverageFrameRate(file);
    expect(fps).not.toBeNull();
    expect(Math.abs((fps as number) - 29.8)).toBeLessThanOrEqual(0.01);
  });

  test("MOV of 300 packets at 1/30 s reads 30", async () => {
    const spacing = 1 / 30;
    const file = await buildVideo("mov", evenTimestamps(300, spacing), spacing);
    expect(await readAverageFrameRate(file)).toBe(30);
  });

  test("WebM is not read (MP4/QTFF only) and returns null", async () => {
    const spacing = 1 / 30;
    const file = await buildVideo(
      "webm",
      evenTimestamps(300, spacing),
      spacing,
    );
    expect(await readAverageFrameRate(file)).toBeNull();
  });

  test("random bytes return null", async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) >>> 24;
    expect(await readAverageFrameRate(new Blob([bytes]))).toBeNull();
  });

  test("an empty Blob returns null", async () => {
    expect(await readAverageFrameRate(new Blob([]))).toBeNull();
  });

  test("deadlineMs: 1 against a real fixture returns null, no rejection", async () => {
    const spacing = 1 / 30;
    const file = await buildVideo("mp4", evenTimestamps(300, spacing), spacing);
    // The read needs several async slices, so 1 ms cannot be enough; the
    // abandoned read finishes in the background and its result is dropped.
    expect(await readAverageFrameRate(file, { deadlineMs: 1 })).toBeNull();
    // Let the abandoned read settle inside the test so a stray rejection would
    // fail this test rather than a later one.
    await new Promise((r) => setTimeout(r, 200));
  });
});

test.describe("withDeadline", () => {
  test("a never-settling promise resolves null at the deadline", async () => {
    const never = new Promise<number>(() => {});
    expect(await withDeadline(never, 5)).toBeNull();
  });

  test("a rejection resolves null", async () => {
    expect(
      await withDeadline(Promise.reject(new Error("boom")), 1000),
    ).toBeNull();
  });

  test("a late rejection after the deadline is swallowed", async () => {
    const late = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("late")), 20),
    );
    expect(await withDeadline(late, 1)).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
  });

  test("a value inside the deadline passes through", async () => {
    expect(await withDeadline(Promise.resolve(29.97), 1000)).toBe(29.97);
  });
});
