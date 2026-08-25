import { expect, test } from '@playwright/test';

import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
  isLiveUpdating,
  isWorking,
  resolveAnalysisStatus,
  withStatsPublished,
} from '@/lib/data/match-analysis';

/**
 * The `timeline` state: a verified point-by-point transcript with no published
 * aggregate statistics.
 *
 * These assertions exist because the failure they guard against is silent. The
 * match page renders every section or none, and every aggregate coerces an
 * absent statistic to 0 on the way to the screen — so getting this wrong prints
 * "0 aces" for a match nobody measured aces on, which reads as a fact about the
 * player.
 */

test.describe('withStatsPublished', () => {
  test('a completed match with no statistics becomes timeline', () => {
    expect(withStatsPublished('completed', false)).toBe('timeline');
  });

  test('a completed match with statistics stays completed', () => {
    expect(withStatsPublished('completed', true)).toBe('completed');
  });

  test('it never promotes a match that has not finished', () => {
    // Only `completed` is eligible. Downgrading anything else would claim a
    // transcript exists for a job that is still running or has failed.
    for (const status of [
      'uploading',
      'uploaded',
      'queued',
      'processing',
      'deriving',
      'processed',
      'failed',
      'derivation_failed',
      'imported',
      'manual',
    ] as const) {
      expect(withStatsPublished(status, false)).toBe(status);
      expect(withStatsPublished(status, true)).toBe(status);
    }
  });
});

test.describe('the timeline state is terminal and renderable', () => {
  test('it is neither in flight nor failed, so the page renders its sections', () => {
    // The match page short-circuits to the progress card on
    // `isInFlight || isAnalysisFailed`. If `timeline` landed in either set, a
    // fully transcribed match would show nothing at all.
    expect(isInFlight('timeline')).toBe(false);
    expect(isAnalysisFailed('timeline')).toBe(false);
  });

  test('it reads as what is present, not as what is missing', () => {
    expect(ANALYSIS_LABEL.timeline).toBe('Timeline ready');
    // Distinct from both neighbours, which mean different things.
    expect(ANALYSIS_LABEL.timeline).not.toBe(ANALYSIS_LABEL.completed);
    expect(ANALYSIS_LABEL.timeline).not.toBe(ANALYSIS_LABEL.processed);
  });
});

test.describe('resolveAnalysisStatus is unchanged', () => {
  test('it still knows nothing about statistics', () => {
    // It projects a processing_jobs row and only that, because the realtime
    // hook calls it over a websocket with no access to match_stats. A caller
    // that cannot answer the statistics question must not guess.
    expect(resolveAnalysisStatus('completed', null)).toBe('processed');
    expect(resolveAnalysisStatus('completed', '0.2.0-transcript')).toBe('completed');
    expect(resolveAnalysisStatus('deriving', null)).toBe('deriving');
    expect(resolveAnalysisStatus('nonsense', null)).toBeUndefined();
  });
});

/**
 * `processed` is in flight and nothing is coming for it — and Team Home has to
 * ask the second question, not the first.
 *
 * The same silent-failure shape as the block above. `processed` is where every
 * vendor-analysed match rests until Phase 2 derivation ships, so a surface that
 * asks `isInFlight` treats the ORDINARY state as the exceptional one: Team
 * Home's match rows withheld a score they had known since the upload wizard,
 * and the first-report card promised a notification no process was ever going
 * to send. Nothing looked broken on either — they just quietly said the wrong
 * thing about most of the program's matches.
 *
 * These assertions pin the distinction the fix rests on. If `processed` is ever
 * moved out of IN_FLIGHT, or STALLED is emptied when Phase 2 lands, this block
 * fails and points at the surfaces that have to be revisited together.
 */
test.describe('processed: in flight, but no update is coming', () => {
  test('the three predicates give three different answers', () => {
    // Will it ever change? Yes — when Phase 2 ships.
    expect(isInFlight('processed')).toBe(true);
    // Is anything running right now? No.
    expect(isWorking('processed')).toBe(false);
    // Is a database update actually coming? No — only a deploy moves it.
    expect(isLiveUpdating('processed')).toBe(false);
  });

  test('it is the only in-flight status that is not live-updating', () => {
    // `uploaded` is the near neighbour and the reason this is a set rather
    // than a second `&&`: also idle, but auto-submit moves it within seconds,
    // so it must keep its dot and its counter.
    expect(isWorking('uploaded')).toBe(false);
    expect(isLiveUpdating('uploaded')).toBe(true);

    for (const status of ['uploading', 'queued', 'processing', 'deriving'] as const) {
      expect(isLiveUpdating(status)).toBe(true);
    }
  });

  test('the settled question separates it from the states that are running', () => {
    // `!isLiveUpdating && !isAnalysisFailed` is Team Home's `settled` in
    // `match-rows.tsx`. Spelled out here as a table because the row it decides
    // shows a result or hides one, and `isInFlight` in its place is a bug that
    // renders perfectly.
    const settled = (status: Parameters<typeof isLiveUpdating>[0]) =>
      !isLiveUpdating(status) && !isAnalysisFailed(status);

    for (const status of ['processed', 'completed', 'timeline', 'imported', 'manual'] as const) {
      expect(settled(status)).toBe(true);
    }
    for (const status of ['uploading', 'uploaded', 'queued', 'processing', 'deriving'] as const) {
      expect(settled(status)).toBe(false);
    }
    // A failed job keeps its dot even though no update is coming for it.
    for (const status of ['failed', 'derivation_failed'] as const) {
      expect(settled(status)).toBe(false);
    }
  });
});
