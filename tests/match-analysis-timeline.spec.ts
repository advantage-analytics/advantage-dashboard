import { expect, test } from '@playwright/test';

import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
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
