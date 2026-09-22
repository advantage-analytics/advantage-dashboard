/**
 * Which match does a stored object belong to?
 *
 * `cleanup-orphan-storage.ts` deletes an object when the match it belongs to is
 * gone. Getting that attribution wrong in the permissive direction deletes
 * athlete video, so this module exists to make "I do not recognise this key" a
 * first-class answer rather than a guess.
 *
 * ── Why this is not just `path.split("/")[2]` ────────────────────────────────
 * It used to be. Every layout in `object-keys.ts` and the match-data bucket
 * happens to put the match id in the third segment, so the rule held for years
 * and `object-keys.ts` documents it as a constraint on new layouts.
 *
 * A layout that does not follow it is not hypothetical. The SwingVision
 * "attach video to an existing match" feature writes
 * `match-video/{match_id}/{attachment_id}/…` into the same Azure container as
 * `videos/…`, putting the match id SECOND. Under the old rule the third segment
 * — the attachment id — was read as a match id, matched nothing in the matches
 * table, and every attachment blob looked orphaned. `--apply` would have
 * deleted live, playable video.
 *
 * The fix is not to teach this file that one extra layout. It is to stop
 * treating "a key I have never seen" as "a key I understand": a store now
 * declares the layouts it writes, anything else is reported and left alone. A
 * layout added later is ignored until someone lists it here, which under-deletes
 * — the direction that costs a little storage rather than someone's match.
 *
 * ── Layouts are derived, never restated ──────────────────────────────────────
 * The shapes below come from calling the real key builders with probe ids and
 * reading back where each id landed. Change a layout in `object-keys.ts` or
 * `upload.service.ts` and this follows automatically; restating the shapes here
 * is the write-side/read-side drift the sweeper exists to clean up after.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ballPathsObjectKey,
  playersObjectKey,
  resultsObjectKey,
  trajectoriesObjectKey,
  trimmedObjectKey,
  videoObjectKey,
} from "../src/lib/services/splitstep/object-keys";
import { UploadService } from "../src/lib/services/upload/upload.service";

/**
 * Probe ids. Uuid-shaped because a layout may legitimately care that a segment
 * looks like an id, and distinct from each other so `indexOf` cannot confuse
 * two of them.
 */
const PROBE_USER = "11111111-1111-4111-8111-111111111111";
const PROBE_MATCH = "22222222-2222-4222-8222-222222222222";
const PROBE_JOB = "33333333-3333-4333-8333-333333333333";
const PROBE_PROVIDER = "swing-vision";

/** A key shape this sweeper knows how to attribute. */
export interface KeyLayout {
  /** For reporting, e.g. `videos/{user}/{match}/…`. */
  label: string;
  /**
   * Literal first segment, or null when the first segment is itself an id.
   * A null prefix matches loosely, so those layouts are only ever offered to
   * the one store that writes them.
   */
  prefix: string | null;
  /** Where the match id sits once the key is split on "/". */
  matchIdIndex: number;
  /** How many segments a key of this layout has. */
  segments: number;
}

/** Uuid shape, loose on version/variant — these are ids we wrote, not input. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function layoutFrom(label: string, sampleKey: string): KeyLayout {
  const parts = sampleKey.split("/");
  const matchIdIndex = parts.indexOf(PROBE_MATCH);

  // A builder that stopped including the match id would otherwise produce a
  // layout that silently matches nothing, and the sweeper would report every
  // object of that shape as unrecognised rather than failing loudly.
  if (matchIdIndex === -1) {
    throw new Error(
      `Key layout "${label}" no longer contains the match id: ${sampleKey}`,
    );
  }

  return {
    label,
    prefix: parts[0] === PROBE_USER ? null : parts[0],
    matchIdIndex,
    segments: parts.length,
  };
}

/**
 * Azure container layouts. `match-video/…` is deliberately absent: those blobs
 * belong to the attachment lifecycle, which has its own worker with leases, a
 * SAS-expiry margin and copy-abort-before-delete ordering that this sweeper
 * cannot replicate. Deleting one here mid-copy can recreate it as an untracked
 * object, which is worse than leaving it.
 */
export const VIDEO_LAYOUTS: KeyLayout[] = [
  layoutFrom(
    "videos/{user}/{match}/original.{ext}",
    videoObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      fileName: "original.mp4",
    }),
  ),
  layoutFrom(
    "trimmed/{user}/{match}/{job}.mp4",
    trimmedObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      jobId: PROBE_JOB,
    }),
  ),
];

/**
 * Vendor results bucket. One layout per file type the store actually writes —
 * the strokes file plus the September-2026 per-frame siblings and our derived
 * ball-paths file — each probed through its own builder rather than assumed
 * from the strokes shape, so a builder that stops carrying the match id
 * throws here at import instead of silently leaving that file type
 * unrecognised. All four happen to share one shape (segment count, `results`
 * prefix, match id third), which is exactly why `attributeKey` never looks at
 * the file name — but that is a fact this file discovers by calling the real
 * builders, not one it assumes.
 *
 * `orphaned/{external_job_id}/{delivery_id}…` keys — the fallback
 * `selectDeliveryStorageKeys` returns when no job matched a delivery at all —
 * are deliberately NOT a layout here and never will be. They carry no match
 * id, so there is nothing for `matchIdIndex` to point at. And "no
 * `processing_jobs` row records this key" cannot be read as "this is an
 * orphan": a delivery not yet adopted by `adoptOrphanedDeliveries` looks
 * identical from here — unrecorded because it is still waiting, not because
 * its match is gone. Leaving these unattributed means the sweeper reports and
 * skips them, which is the only safe answer until adoption resolves them into
 * a real results key.
 */
export const RESULTS_LAYOUTS: KeyLayout[] = [
  layoutFrom(
    "results/{user}/{match}/{job}.json",
    resultsObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      jobId: PROBE_JOB,
    }),
  ),
  layoutFrom(
    "results/{user}/{match}/{job}.players.json",
    playersObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      jobId: PROBE_JOB,
    }),
  ),
  layoutFrom(
    "results/{user}/{match}/{job}.trajectories.json",
    trajectoriesObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      jobId: PROBE_JOB,
    }),
  ),
  layoutFrom(
    "results/{user}/{match}/{job}.ball-paths.json",
    ballPathsObjectKey({
      userId: PROBE_USER,
      matchId: PROBE_MATCH,
      jobId: PROBE_JOB,
    }),
  ),
];

/**
 * Uploaded provider files. This layout leads with the user id rather than a
 * literal prefix, so it matches on shape alone — which is exactly why it is
 * scoped to its own bucket and never offered to the video container.
 */
export const MATCH_DATA_LAYOUTS: KeyLayout[] = [
  layoutFrom(
    "{user}/{provider}/{match}/{file}",
    // buildStoragePath does not touch the client; the cast keeps this a pure
    // shape probe rather than a reason to construct a real Supabase client.
    new UploadService(null as unknown as SupabaseClient).buildStoragePath({
      userId: PROBE_USER,
      providerId: PROBE_PROVIDER,
      matchId: PROBE_MATCH,
      fileName: "match.xlsx",
    }),
  ),
];

/**
 * The match id this key belongs to, or null when no known layout explains it.
 *
 * Null means "do not touch": the caller reports it and moves on. It never means
 * "orphan".
 */
export function attributeKey(
  path: string,
  layouts: readonly KeyLayout[],
): string | null {
  const parts = path.split("/");

  for (const layout of layouts) {
    if (parts.length !== layout.segments) continue;
    if (layout.prefix !== null && parts[0] !== layout.prefix) continue;
    // A null prefix still has to look like the id it stands in for, or this
    // layout would accept any key of the right length.
    if (layout.prefix === null && !UUID.test(parts[0])) continue;

    const matchId = parts[layout.matchIdIndex];
    if (!UUID.test(matchId)) continue;

    return matchId;
  }

  return null;
}
