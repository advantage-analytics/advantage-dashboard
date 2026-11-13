import type { ActiveAttachment } from "@/lib/match-video/types";

/*
 * Client-safe on purpose: `./index.ts` reads this for the sample page's
 * browser bundle, so nothing here may import a server module. The route's
 * own code is `@/lib/services/sample-match/video`, which re-exports it.
 */

/**
 * The attachment metadata the sample answers with. Fixed, because the hook's
 * refresh contract compares `id` and `version` across polls: a stable pair
 * reads as "nothing changed, only the URL was refreshed", which is always the
 * truth here. The id is a placeholder in the fixture's own
 * `00000000-0000-4000-8000-` range and names no row anywhere.
 *
 * `durationSeconds` is the one field the Film timeline reads for its clock.
 * `0` means "unknown" to `clockOf()` (the player then uses the element's own
 * duration), and stays until the clip is cut and measured.
 */
export const SAMPLE_VIDEO_ATTACHMENT: ActiveAttachment = {
  id: "00000000-0000-4000-8000-5a4d504c4531",
  version: 1,
  offsetSeconds: 0,
  confirmedVideoTimeSeconds: 0,
  durationSeconds: 0,
  contentType: "video/mp4",
  filename: "sample-match.mp4",
};
