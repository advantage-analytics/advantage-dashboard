/**
 * The two reads `getMatchVideo` and `getMatchFilmEntry` both make, memoized
 * for the request rather than for the caller.
 *
 * `resolveMatchVideo` and `resolveMatchFilmEntry` walk the same ladder over
 * the same match — authorize, read the active attachment row, probe the final
 * blob — and `matches/(detail)/[matchId]/page.tsx` calls them side by side in
 * one `Promise.all`. Both loaders are already `cache()`d, but React `cache()`
 * memoizes per FUNCTION: each deduped against itself and neither against the
 * other, so one render of an attachment-backed match paid two service-role
 * reads of `match_video_attachments` and two cross-cloud `Get Blob Properties`
 * round trips to answer one question twice.
 *
 * Caching the SEAMS instead fixes that without either resolver losing a check.
 * Each still runs its own authorization before it reaches these — the film
 * entry's is strictly the stronger of the two — and `cache()` is scoped to one
 * request, so no answer is ever shared between two users.
 *
 * `finalObjectExists` is keyed on the row object's identity. That works only
 * because the attachment read is cached too and hands both callers the very
 * same object; if you ever stop caching `activeAttachment`, this stops
 * deduping and silently goes back to two HEADs.
 */

import { cache } from "react";

import type { MatchVideoResult } from "@/lib/match-video/types";
import type { HttpResult } from "@/lib/services/match-video/http";
import {
  azurePlaybackStorage,
  type PlaybackAttachmentRow,
  supabaseActiveAttachment,
} from "@/lib/services/match-video/playback";
import { lazyAdminClient } from "@/lib/supabase/admin";

/** The active row under a match. Service role — callers authorize first. */
export const activeAttachment = cache(
  (matchId: string): Promise<HttpResult<PlaybackAttachmentRow | null>> =>
    supabaseActiveAttachment(lazyAdminClient())(matchId),
);

/** Does the trimmed final blob exist? One HEAD per row per request. */
export const finalObjectExists = cache(
  (row: PlaybackAttachmentRow): Promise<MatchVideoResult<boolean>> =>
    azurePlaybackStorage().finalObjectExists(row),
);
