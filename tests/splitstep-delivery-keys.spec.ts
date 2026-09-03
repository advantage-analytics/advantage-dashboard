import { expect, test } from '@playwright/test';

import { selectDeliveryStorageKeys } from '@/lib/services/splitstep/delivery-storage-keys';

/**
 * Which storage keys a `completed` delivery writes to, given the matched job's
 * attribution. The webhook route (`api/webhooks/splitstep/route.ts`) is a
 * Supabase-backed handler that cannot be unit-tested, so this selection was
 * pulled into a pure helper — this file is the whole test surface for it.
 *
 * The load-bearing case is the retained match: a team match whose uploader
 * deleted their account mid-processing keeps its `match_id` but loses
 * `created_by` (set null by `release_my_account_from_programs()`). Its trimmed
 * video is still attributable via `match_id` and deletable via
 * `purgeMatchStorage`, so it MUST get a key rather than being skipped —
 * otherwise the retained match ends with stats but no video.
 */

test.describe('selectDeliveryStorageKeys', () => {
  test('a fully attributed completion keys both assets under the uploader', () => {
    const keys = selectDeliveryStorageKeys({
      jobId: 'job-1',
      createdBy: 'user-1',
      matchId: 'match-1',
      externalJobId: 'ext-1',
      deliveryId: 'del-1',
    });

    expect(keys.resultsKey).toBe('results/user-1/match-1/job-1.json');
    // The per-frame files sit beside the strokes file, suffixed — match id
    // stays the third segment for the sweeper, and the strokes key is
    // unchanged for everything that already reads results_object_key.
    expect(keys.playersKey).toBe('results/user-1/match-1/job-1.players.json');
    expect(keys.trajectoriesKey).toBe('results/user-1/match-1/job-1.trajectories.json');
    expect(keys.trimmedKey).toBe('trimmed/user-1/match-1/job-1.mp4');
  });

  test('a retained match whose uploader left keys both assets under former-member', () => {
    // created_by is null (the account was deleted mid-processing) but match_id
    // survives. Both keys must still be produced — the trimmed video is the
    // regression this helper exists to prevent — and match_id stays the THIRD
    // path segment, so cleanup-orphan-storage.ts still attributes it and
    // purgeMatchStorage still deletes it.
    const keys = selectDeliveryStorageKeys({
      jobId: 'job-2',
      createdBy: null,
      matchId: 'match-2',
      externalJobId: 'ext-2',
      deliveryId: 'del-2',
    });

    expect(keys.resultsKey).toBe('results/former-member/match-2/job-2.json');
    expect(keys.playersKey).toBe('results/former-member/match-2/job-2.players.json');
    expect(keys.trajectoriesKey).toBe('results/former-member/match-2/job-2.trajectories.json');
    expect(keys.trimmedKey).toBe('trimmed/former-member/match-2/job-2.mp4');
  });

  test('an unmatched delivery keeps results under an orphan key and skips the video', () => {
    // No job matched: the results JSON is small and worth keeping under any key,
    // but a multi-GB video with nothing to attribute it to gets no key at all.
    const keys = selectDeliveryStorageKeys({
      jobId: null,
      createdBy: null,
      matchId: null,
      externalJobId: 'ext-3',
      deliveryId: 'del-3',
    });

    expect(keys.resultsKey).toBe('orphaned/ext-3/del-3.json');
    expect(keys.playersKey).toBe('orphaned/ext-3/del-3.players.json');
    expect(keys.trajectoriesKey).toBe('orphaned/ext-3/del-3.trajectories.json');
    expect(keys.trimmedKey).toBeNull();
  });

  test('an unmatched delivery with no external job id falls back to unknown', () => {
    const keys = selectDeliveryStorageKeys({
      jobId: null,
      createdBy: null,
      matchId: null,
      externalJobId: null,
      deliveryId: 'del-4',
    });

    expect(keys.resultsKey).toBe('orphaned/unknown/del-4.json');
    expect(keys.trimmedKey).toBeNull();
  });
});
