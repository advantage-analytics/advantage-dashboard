import { expect, test } from "@playwright/test";
import {
  reportTrimSkip,
  trimSkipProperties,
  type VideoCutSkippedEvent,
} from "@/lib/video/trim-telemetry";
import type { TrimSkipReason } from "@/lib/video/trim-plan";

/**
 * A match video that skips the in-browser cut goes up whole. The reason used
 * to reach only the uploader's console — Jerry Shi v JR (2026-11-25) went up
 * as a raw 5.3 GB file and took hours to explain. These pin that every skip
 * but `whole-clip` sends `video_cut_skipped` naming its reason.
 */

const CONTEXT = {
  surface: "wizard" as const,
  matchId: "11111111-1111-1111-1111-111111111111",
  jobId: "22222222-2222-2222-2222-222222222222",
  fileSizeBytes: 5.3 * 1024 * 1024 * 1024,
};

function capture() {
  const sent: { event: string; properties: VideoCutSkippedEvent }[] = [];
  return {
    sent,
    send: (event: string, properties: VideoCutSkippedEvent) => {
      sent.push({ event, properties });
    },
  };
}

const SKIPS: Exclude<TrimSkipReason, "whole-clip">[] = [
  "no-opfs",
  "no-quota",
  "unsupported",
  "no-encoder",
  "failed",
];

for (const reason of SKIPS) {
  test(`a "${reason}" skip emits video_cut_skipped with its reason`, () => {
    const { sent, send } = capture();
    reportTrimSkip({ reason }, CONTEXT, send);
    expect(sent).toEqual([
      {
        event: "video_cut_skipped",
        properties: {
          surface: "wizard",
          reason,
          match_id: CONTEXT.matchId,
          job_id: CONTEXT.jobId,
          file_size_mb: 5427.2,
          discarded_tracks: [],
          discarded_summary: null,
        },
      },
    ]);
  });
}

test("a whole-clip window is the normal no-cut case and sends nothing", () => {
  const { sent, send } = capture();
  reportTrimSkip({ reason: "whole-clip" }, CONTEXT, send);
  expect(sent).toEqual([]);
  expect(trimSkipProperties({ reason: "whole-clip" }, CONTEXT)).toBeNull();
});

test("the tracks Mediabunny would drop travel with the event", () => {
  const properties = trimSkipProperties(
    {
      reason: "unsupported",
      discarded: [
        { type: "audio", codec: null, reason: "unknown_source_codec" },
        { type: "video", codec: "hevc", reason: "undecodable_source_codec" },
      ],
    },
    { ...CONTEXT, surface: "attachment", jobId: undefined },
  );
  expect(properties).toMatchObject({
    surface: "attachment",
    job_id: null,
    discarded_tracks: [
      { type: "audio", codec: null, reason: "unknown_source_codec" },
      { type: "video", codec: "hevc", reason: "undecodable_source_codec" },
    ],
    discarded_summary:
      "audio:unknown:unknown_source_codec,video:hevc:undecodable_source_codec",
  });
});

test("a send that throws never stops the upload", () => {
  expect(() =>
    reportTrimSkip({ reason: "failed" }, CONTEXT, () => {
      throw new Error("posthog down");
    }),
  ).not.toThrow();
});
