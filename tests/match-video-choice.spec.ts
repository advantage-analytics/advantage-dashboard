import { expect, test } from "@playwright/test";

import { choosePlaybackFile } from "@/lib/data/match-video-choice";

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
