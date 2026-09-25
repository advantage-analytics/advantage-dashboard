import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  analysedWindowSeconds,
  choosePlaybackFile,
} from "@/lib/data/match-video-choice";
import {
  resolveMatchVideo,
  type MatchVideo,
  type MatchVideoDeps,
} from "@/lib/data/match-video-server";
import { matchVideoError } from "@/lib/match-video/types";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import { transportError } from "@/lib/services/match-video/http";
import type { PlaybackAttachmentRow } from "@/lib/services/match-video/playback";

/**
 * The film room used to play only the vendor's re-encode, which arrived with
 * no audio track, and seek in it by subtracting the trim start. Our own upload
 * is now preferred, and it sits on the analysis clock, so its offset is 0.
 * Getting the offset wrong puts every seek 15 seconds off with nothing looking
 * broken.
 */

const exists =
  (...present: string[]) =>
  async (name: string) =>
    present.includes(name);

test("prefers our own upload, with no offset", async () => {
  const choice = await choosePlaybackFile(
    [
      {
        video_object_key: "videos/u/m/original.mp4",
        trimmed_object_key: "trimmed/u/m/j.mp4",
        start_time_seconds: 15.136,
      },
    ],
    exists("videos/u/m/original.mp4", "trimmed/u/m/j.mp4"),
  );
  expect(choice).toEqual({
    blobName: "videos/u/m/original.mp4",
    startTimeSeconds: 0,
    source: "upload",
  });
});

test("falls back to the vendor copy, offset by the trim start, when our file is gone", async () => {
  const choice = await choosePlaybackFile(
    [
      {
        video_object_key: "videos/u/m/original.mp4",
        trimmed_object_key: "trimmed/u/m/j.mp4",
        start_time_seconds: "15.136",
      },
    ],
    exists("trimmed/u/m/j.mp4"),
  );
  expect(choice).toEqual({
    blobName: "trimmed/u/m/j.mp4",
    startTimeSeconds: 15.136,
    source: "vendor-copy",
  });
});

test("the newest job wins, and a job with nothing playable is skipped", async () => {
  const choice = await choosePlaybackFile(
    [
      {
        video_object_key: null,
        trimmed_object_key: null,
        start_time_seconds: 0,
      },
      {
        video_object_key: "videos/u/m/newer.mp4",
        trimmed_object_key: null,
        start_time_seconds: 0,
      },
      {
        video_object_key: "videos/u/m/older.mp4",
        trimmed_object_key: null,
        start_time_seconds: 0,
      },
    ],
    exists("videos/u/m/newer.mp4", "videos/u/m/older.mp4"),
  );
  expect(choice?.blobName).toBe("videos/u/m/newer.mp4");
});

test("no files at all is no video", async () => {
  expect(await choosePlaybackFile([], exists())).toBeNull();
  expect(
    await choosePlaybackFile(
      [
        {
          video_object_key: "gone.mp4",
          trimmed_object_key: null,
          start_time_seconds: 0,
        },
      ],
      exists(),
    ),
  ).toBeNull();
});

test.describe("analysedWindowSeconds", () => {
  test("is the job's window in whole seconds (Revelli vs Stepanov)", () => {
    expect(
      analysedWindowSeconds([
        {
          start_time_seconds: "15.136251479237528",
          end_time_seconds: "5196.342780873547",
        },
      ]),
    ).toBe(5181);
  });

  test("the newest job with a real window answers", () => {
    expect(
      analysedWindowSeconds([
        { start_time_seconds: 10, end_time_seconds: 10 },
        { start_time_seconds: 0, end_time_seconds: 3600 },
        { start_time_seconds: 0, end_time_seconds: 60 },
      ]),
    ).toBe(3600);
  });

  test("no job, or no readable window, is no duration", () => {
    expect(analysedWindowSeconds([])).toBeNull();
    expect(
      analysedWindowSeconds([
        { start_time_seconds: null, end_time_seconds: null },
        { start_time_seconds: "abc", end_time_seconds: 90 },
      ]),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The loader (T23) — which lineage answers, and in what order it may ask
 * ---------------------------------------------------------------------- */

/**
 * `resolveMatchVideo` resolves the ACTIVE SwingVision attachment first and
 * falls through to the Advantage Intelligence job selection above only when
 * there is no attachment at all. Four claims are worth more than the rest:
 *
 *   1. VISIBILITY BEFORE PRIVILEGE. The `matches` read through the caller's
 *      own client happens before the service-role attachment read and before
 *      anything is signed — proved by the call log, not by reading the code.
 *   2. A NEGATIVE OFFSET IS ORDINARY. The offset is a signed subtraction
 *      (`filmTime = pointTime - offset`), so a recording that was already
 *      rolling before the source clock's first point has a negative one.
 *      Clamping it would push every such match's seeks off by the lead-in.
 *   3. ONLY THE ACTIVE FINAL ASSET. A staged or retired row is never fetched,
 *      and an active row whose file is gone is not "no video" and is not a
 *      licence to play some other lineage's footage.
 *   4. NOTHING IS WRITTEN. Attaching a video does not rewrite an imported row
 *      or rename its provenance.
 */

const MATCH_ID = randomUUID();
const OTHER_MATCH_ID = randomUUID();

const VISIBLE: Record<string, VisibleMatchRow> = {
  [MATCH_ID]: {
    id: MATCH_ID,
    created_by: randomUUID(),
    program_id: null,
    source_provider: "swing-vision",
  },
  [OTHER_MATCH_ID]: {
    id: OTHER_MATCH_ID,
    created_by: randomUUID(),
    program_id: null,
    source_provider: "splitstep",
  },
};

const ACTIVE_ROW: PlaybackAttachmentRow = {
  id: randomUUID(),
  version: 4,
  offset_seconds: 12.5,
  confirmed_video_time_seconds: 40.5,
  verified_duration_seconds: 5400,
  verified_content_type: "video/mp4",
  filename: "match.mp4",
  final_blob_key: "match-video/final.mp4",
};

/** The Advantage Intelligence answer, so a fall-through is unmistakable. */
const PROVIDER_VIDEO: MatchVideo = {
  url: "https://blob.example/videos/u/m/original.mp4?sig=x",
  expiresAt: "2026-01-01T00:30:00.000Z",
  startTimeSeconds: 0,
  source: "upload",
  attachment: null,
};

interface Scenario {
  userId?: string | null;
  matchError?: string | null;
  /** `undefined` means "no active attachment". */
  row?: PlaybackAttachmentRow;
  attachmentError?: boolean;
  attachmentThrows?: boolean;
  storageUnreachable?: boolean;
  objectMissing?: boolean;
  signingFails?: boolean;
}

function harness(scenario: Scenario = {}) {
  const calls: string[] = [];
  const deps: MatchVideoDeps = {
    async currentUserId() {
      calls.push("currentUserId");
      return scenario.userId === undefined ? randomUUID() : scenario.userId;
    },
    async loadVisibleMatch(matchId) {
      calls.push("loadVisibleMatch");
      if (scenario.matchError) {
        return { match: null, error: scenario.matchError };
      }
      return { match: VISIBLE[matchId] ?? null, error: null };
    },
    async activeWorkspace() {
      calls.push("activeWorkspace");
      return null;
    },
    async loadActiveAttachment() {
      calls.push("loadActiveAttachment");
      if (scenario.attachmentThrows) throw new Error("connection reset");
      if (scenario.attachmentError) {
        return {
          ok: false,
          error: transportError("internal_error", "attachment_read_failed"),
        };
      }
      return { ok: true, value: scenario.row ?? null };
    },
    async finalObjectExists() {
      calls.push("finalObjectExists");
      if (scenario.storageUnreachable) {
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "head_failed"),
        };
      }
      return { ok: true, value: !scenario.objectMissing };
    },
    mintPlayback() {
      calls.push("mintPlayback");
      if (scenario.signingFails) {
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "sas_signing_failed"),
        };
      }
      return {
        ok: true,
        value: {
          playbackUrl: "https://blob.example/match-video/final.mp4?sig=y",
          expiresAt: new Date("2026-01-01T00:30:00.000Z"),
        },
      };
    },
    async loadProviderVideo() {
      calls.push("loadProviderVideo");
      return PROVIDER_VIDEO;
    },
  };
  return { deps, calls };
}

test("an active attachment answers, carrying its identity, duration and offset", async () => {
  const { deps, calls } = harness({ row: ACTIVE_ROW });
  const video = await resolveMatchVideo(MATCH_ID, deps);

  expect(video).toEqual({
    url: "https://blob.example/match-video/final.mp4?sig=y",
    expiresAt: "2026-01-01T00:30:00.000Z",
    startTimeSeconds: 12.5,
    source: "attachment",
    attachment: {
      id: ACTIVE_ROW.id,
      version: 4,
      durationSeconds: 5400,
      contentType: "video/mp4",
      filename: "match.mp4",
      // No retention seam in this harness: no clock, no notice.
      expiresAt: null,
      monthsUnwatched: null,
      expiryWarning: false,
    },
  });
  // The job query is never reached for a match that has an attachment.
  expect(calls).not.toContain("loadProviderVideo");
});

/* SwingVision Add video T10 — the attachment's retention clock. */

const NOW = new Date("2026-09-23T12:00:00.000Z");

test("the attachment carries its expiry from matchVideoExpiry", async () => {
  const { deps } = harness({ row: ACTIVE_ROW });
  const video = await resolveMatchVideo(MATCH_ID, {
    ...deps,
    now: () => NOW,
    // Watched Oct 23 2025, activated long before: the view is the clock.
    loadRetention: async () => ({
      activatedAt: "2025-01-01T00:00:00.000Z",
      lastViewedAt: "2025-10-23T12:00:00.000Z",
    }),
  });
  expect(video?.attachment).toMatchObject({
    expiresAt: "2026-10-23T12:00:00.000Z",
    monthsUnwatched: 11,
    expiryWarning: true,
  });
});

test("outside the window the clock is carried, and no warning", async () => {
  const { deps } = harness({ row: ACTIVE_ROW });
  const video = await resolveMatchVideo(MATCH_ID, {
    ...deps,
    now: () => NOW,
    loadRetention: async () => ({
      activatedAt: "2026-06-01T00:00:00.000Z",
      lastViewedAt: null,
    }),
  });
  expect(video?.attachment).toMatchObject({
    expiresAt: "2027-06-01T00:00:00.000Z",
    monthsUnwatched: 3,
    expiryWarning: false,
  });
});

test("an unreadable retention clock costs the notice, never the video", async () => {
  for (const loadRetention of [
    async () => null,
    async () => ({ activatedAt: null, lastViewedAt: null }),
    async () => {
      throw new Error("column last_viewed_at does not exist");
    },
  ]) {
    const { deps } = harness({ row: ACTIVE_ROW });
    const video = await resolveMatchVideo(MATCH_ID, {
      ...deps,
      now: () => NOW,
      loadRetention,
    });
    expect(video?.url).toBe("https://blob.example/match-video/final.mp4?sig=y");
    expect(video?.attachment).toMatchObject({
      expiresAt: null,
      monthsUnwatched: null,
      expiryWarning: false,
    });
  }
});

test("visibility is asked BEFORE the privileged read and before anything is signed", async () => {
  const { deps, calls } = harness({ row: ACTIVE_ROW });
  await resolveMatchVideo(MATCH_ID, deps);

  expect(calls).toEqual([
    "currentUserId",
    "loadVisibleMatch",
    "loadActiveAttachment",
    "finalObjectExists",
    "mintPlayback",
  ]);
  expect(calls.indexOf("loadVisibleMatch")).toBeLessThan(
    calls.indexOf("loadActiveAttachment"),
  );
  expect(calls.indexOf("loadVisibleMatch")).toBeLessThan(
    calls.indexOf("mintPlayback"),
  );
});

test("a caller who cannot see the match reaches no privileged seam at all", async () => {
  // Invisible or absent — RLS gives the same answer, and so does this.
  const invisible = harness();
  expect(await resolveMatchVideo(randomUUID(), invisible.deps)).toBeNull();
  expect(invisible.calls).toEqual(["currentUserId", "loadVisibleMatch"]);

  // Signed out: refused before the id is even looked up.
  const anonymous = harness({ userId: null });
  expect(await resolveMatchVideo(MATCH_ID, anonymous.deps)).toBeNull();
  expect(anonymous.calls).toEqual(["currentUserId"]);

  // A malformed id cannot name a row, so it is refused before any read.
  const malformed = harness();
  expect(await resolveMatchVideo("not-a-uuid", malformed.deps)).toBeNull();
  expect(malformed.calls).toEqual(["currentUserId"]);

  // A failed `matches` read is not a licence either.
  const unreadable = harness({ matchError: "connection reset" });
  expect(await resolveMatchVideo(MATCH_ID, unreadable.deps)).toBeNull();
  expect(unreadable.calls).toEqual(["currentUserId", "loadVisibleMatch"]);
  expect(unreadable.calls).not.toContain("loadProviderVideo");
});

test("a negative offset plays: the video started before the first point", async () => {
  // Someone hit record and then walked onto the court, so the first point's
  // source time is EARLIER than its position in the file:
  // offset = firstPointSourceTime - confirmedVideoTime = 3 - 128.25.
  const early = { ...ACTIVE_ROW, offset_seconds: -125.25 };
  const { deps } = harness({ row: early });
  const video = await resolveMatchVideo(MATCH_ID, deps);

  expect(video?.startTimeSeconds).toBe(-125.25);
  expect(video?.source).toBe("attachment");
  // filmTime = pointTime - offset, so a point 3s into the source clock sits
  // 128.25s into this file. Clamping the offset to 0 would seek to 3s.
  expect(3 - (video?.startTimeSeconds ?? 0)).toBeCloseTo(128.25, 6);

  // And the positive sign still behaves, unchanged.
  const late = harness({ row: { ...ACTIVE_ROW, offset_seconds: 125.25 } });
  const lateVideo = await resolveMatchVideo(MATCH_ID, late.deps);
  expect(lateVideo?.startTimeSeconds).toBe(125.25);

  // Zero is a legitimate saved alignment, not a missing one.
  const aligned = harness({ row: { ...ACTIVE_ROW, offset_seconds: 0 } });
  expect(
    (await resolveMatchVideo(MATCH_ID, aligned.deps))?.startTimeSeconds,
  ).toBe(0);
});

test("only the ACTIVE final asset is ever fetched — staged and retired are not filtered, they are not selected", async () => {
  // The loader borrows T12's seam rather than writing a third way to read the
  // row, so `state = 'active'` is in the WHERE clause and the staged key is
  // not even in the projection. It reaches that seam through the shared
  // request-scoped wrapper, so both the loader and the wrapper are checked —
  // neither may grow a query of its own.
  const source = readFileSync("src/lib/data/match-video-server.ts", "utf8");
  expect(source).not.toContain("staged_blob_key");
  expect(source).not.toContain("staged");

  const shared = readFileSync("src/lib/data/match-video-seams.ts", "utf8");
  expect(shared).toContain("supabaseActiveAttachment");
  expect(shared).not.toContain("staged");
  expect(shared).not.toContain(".from(");

  const seam = readFileSync("src/lib/services/match-video/playback.ts", "utf8");
  expect(seam).toMatch(/\.eq\("state",\s*"active"\)/);
});

test("an active attachment whose file is gone is not 'no video', and never borrows the other lineage's footage", async () => {
  for (const scenario of [
    { objectMissing: true },
    { storageUnreachable: true },
    { signingFails: true },
    { attachmentError: true },
    { attachmentThrows: true },
  ] satisfies Scenario[]) {
    const { deps, calls } = harness({ row: ACTIVE_ROW, ...scenario });
    expect(await resolveMatchVideo(MATCH_ID, deps)).toBeNull();
    expect(
      calls,
      "a broken attachment must never fall through to the provider job",
    ).not.toContain("loadProviderVideo");
  }
});

test("a match with no attachment falls through to the Advantage Intelligence path, unchanged", async () => {
  const { deps, calls } = harness();
  const video = await resolveMatchVideo(OTHER_MATCH_ID, deps);

  expect(video).toEqual(PROVIDER_VIDEO);
  expect(video?.source).toBe("upload");
  expect(video?.attachment).toBeNull();
  expect(calls).toEqual([
    "currentUserId",
    "loadVisibleMatch",
    "loadActiveAttachment",
    "loadProviderVideo",
  ]);
  // The provider lineage is never probed or signed through the attachment
  // seams — it keeps its own selection, its own existence check and its own
  // legacy offset.
  expect(calls).not.toContain("finalObjectExists");
  expect(calls).not.toContain("mintPlayback");
});

test("the legacy offset still reaches MatchVideo untouched", async () => {
  // The vendor re-encode case, end to end through the loader: the job's trim
  // start is the film clock's zero and the loader must not round, clamp or
  // zero it on the way out.
  const { deps } = harness();
  deps.loadProviderVideo = async () => ({
    url: "https://blob.example/trimmed/u/m/j.mp4?sig=z",
    expiresAt: "2026-01-01T00:30:00.000Z",
    startTimeSeconds: 15.136,
    source: "vendor-copy",
    attachment: null,
  });
  const video = await resolveMatchVideo(OTHER_MATCH_ID, deps);
  expect(video?.startTimeSeconds).toBe(15.136);
  expect(video?.source).toBe("vendor-copy");
});

test("the loader writes nothing — no imported row is rewritten and no provenance renamed", async () => {
  const source = readFileSync("src/lib/data/match-video-server.ts", "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const write of [
    ".insert(",
    ".upsert(",
    ".update(",
    ".delete(",
    ".rpc(",
  ]) {
    expect(code, `${write} has no business in a playback loader`).not.toContain(
      write,
    );
  }
  // The only tables it names, and both are read.
  expect(code).toContain('.from("processing_jobs")');
  expect(code).not.toContain('.from("points")');
  expect(code).not.toContain('.from("shots")');
  expect(code).not.toContain('.from("matches")');
  expect(code).not.toContain("source_provider");

  // And the seams it is handed cannot write either: every one is a read, and
  // `mintPlayback` returns a credential type with no upload field.
  const { deps } = harness({ row: ACTIVE_ROW });
  expect(Object.keys(deps).sort()).toEqual([
    "activeWorkspace",
    "currentUserId",
    "finalObjectExists",
    "loadActiveAttachment",
    "loadProviderVideo",
    "loadVisibleMatch",
    "mintPlayback",
  ]);
});
