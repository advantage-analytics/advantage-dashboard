/**
 * Whole-track average frame rate, read from an MP4/MOV container's index.
 *
 * Why this exists (job 45ff4bd7, 2026-09-28): the vendor rejected a file whose
 * metadata average is 29.94 fps against a 29.9 floor. The wizard's probe
 * samples ~20 frames near the start and snaps within 2%, so it read "30". A
 * 20-frame sample cannot tell genuine 29.97 (which reads as low as 29.93 in
 * Apple's 1/600 timebase) from a 29.94 variable-frame-rate average; the
 * whole-track average can.
 *
 * For MP4/MOV the packet index lives in `moov`, so `computePacketStats()` walks
 * the sample table, not the media data — a multi-gigabyte file costs a few
 * small slices. Matroska/WebM would need a cluster scan, so they are not
 * recognised here and return `null`, which keeps the caller's existing
 * behaviour.
 *
 * mediabunny's `averagePacketRate` is `packetCount / (lastEnd - firstStart)`,
 * where `lastEnd` is the last packet's timestamp PLUS its duration — so N
 * packets spaced exactly 1001/30000 s report 29.97, not N-1 over the span.
 *
 * `track.computeFrameRateMetrics()` also exists (its `underlyingFrameRate` is
 * `null` for VFR) but the vendor's check is against the average, so that is
 * what this reports.
 *
 * mediabunny is imported dynamically so the upload wizard's main bundle does
 * not grow by the demuxer.
 */

/**
 * Default deadline for one read. The `moov` index of a long phone recording is
 * a few megabytes read in a few slices, so an honest file settles well inside
 * this; one that does not is treated as "unknown" (`null`) rather than holding
 * the wizard up.
 */
export const CONTAINER_FRAME_RATE_DEADLINE_MS = 4000;

/**
 * Resolves with `work`'s value, or with `null` if `work` rejects or has not
 * settled within `deadlineMs`. Never rejects, and a late rejection of `work`
 * is swallowed so it cannot surface as an unhandled rejection.
 */
export function withDeadline<T>(
  work: Promise<T>,
  deadlineMs: number,
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), deadlineMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function readUnbounded(file: Blob): Promise<number | null> {
  const { Input, BlobSource, MP4, QTFF } = await import("mediabunny");
  const input = new Input({
    formats: [MP4, QTFF],
    source: new BlobSource(file),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const { packetCount, averagePacketRate } = await track.computePacketStats();
    if (packetCount === 0 || !Number.isFinite(averagePacketRate)) return null;
    if (averagePacketRate <= 0) return null;
    return Math.round(averagePacketRate * 100) / 100;
  } finally {
    input.dispose();
  }
}

/**
 * The primary video track's whole-track average frame rate, rounded to two
 * decimals, or `null` when it cannot be read: not MP4/QTFF, no video track,
 * any mediabunny error, or not settled by `deadlineMs`. Never throws.
 */
export async function readAverageFrameRate(
  file: Blob,
  options?: { deadlineMs?: number },
): Promise<number | null> {
  const deadlineMs = options?.deadlineMs ?? CONTAINER_FRAME_RATE_DEADLINE_MS;
  // readUnbounded is async, so calling it can never throw synchronously —
  // any failure surfaces as a rejection, which withDeadline already turns
  // into null.
  return withDeadline(readUnbounded(file), deadlineMs);
}

/** What the container says the picture is, and whether this tab can fix it. */
export interface ContainerVideoFormat {
  /** Mediabunny's codec name ("avc", "hevc", …), or null when unnamed. */
  videoCodec: string | null;
  /**
   * Whether this browser can decode the track AND encode 1080p H.264, i.e.
   * whether the pre-upload re-encode (`src/lib/video/trim-plan.ts`) can run.
   */
  canConvert: boolean;
}

async function readFormatUnbounded(
  file: Blob,
): Promise<ContainerVideoFormat | null> {
  const { Input, BlobSource, ALL_FORMATS, canEncodeVideo } =
    await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const videoCodec = await track.getCodec();
    const [decodes, encodes] = await Promise.all([
      track.canDecode(),
      canEncodeVideo("avc", { width: 1920, height: 1080 }),
    ]);
    return { videoCodec, canConvert: decodes && encodes };
  } finally {
    input.dispose();
  }
}

/**
 * The primary video track's codec and whether this browser could re-encode it,
 * or `null` when the container cannot be read in time. Never throws.
 */
export async function readContainerVideoFormat(
  file: Blob,
  options?: { deadlineMs?: number },
): Promise<ContainerVideoFormat | null> {
  const deadlineMs = options?.deadlineMs ?? CONTAINER_FRAME_RATE_DEADLINE_MS;
  return withDeadline(readFormatUnbounded(file), deadlineMs);
}
