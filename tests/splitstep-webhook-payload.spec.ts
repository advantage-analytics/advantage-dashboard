import { expect, test } from '@playwright/test';

import { parseWebhookPayload } from '@/lib/services/splitstep/webhook-payload';

/**
 * The webhook payload parser, against the shapes in the vendor's published
 * docs (https://splitstep.ai/api-docs.html, September 2026 revision) and the
 * one shape that preceded them.
 *
 * This module had no tests while its whole job was guessing at a payload
 * nobody had seen. The vendor has since renamed a field once (`sas_url` →
 * `strokes_url`) and added two more, which is exactly the class of change that
 * fails silently here: a completion is recorded, matched and marked complete,
 * and its results are simply never downloaded. These cases pin every url the
 * route depends on.
 */

const STROKES = 'https://vendor.blob.core.windows.net/out/job/strokes.json?sig=a';
const PLAYERS = 'https://vendor.blob.core.windows.net/out/job/players.json?sig=b';
const TRAJECTORIES = 'https://vendor.blob.core.windows.net/out/job/trajectories.json?sig=c';
const TRIMMED = 'https://vendor.blob.core.windows.net/out/job/trimmed.mp4?sig=d';

test.describe('parseWebhookPayload', () => {
  test('job_completed (September 2026 docs): every url is found by its new name', () => {
    const out = parseWebhookPayload({
      job_id: '6aab6d28-2964-4c4d-a71a-2536df9b88fb',
      video_id: '79de1d34-eb5e-47ec-be4e-1f2c87a64dff',
      status: 'job_completed',
      message: 'Job completed successfully',
      strokes_url: STROKES,
      players_url: PLAYERS,
      trajectories_url: TRAJECTORIES,
      trimmed_video_url: TRIMMED,
    });

    expect(out.externalJobId).toBe('6aab6d28-2964-4c4d-a71a-2536df9b88fb');
    expect(out.nextStatus).toBe('completed');
    expect(out.strokesUrl).toBe(STROKES);
    expect(out.playersUrl).toBe(PLAYERS);
    expect(out.trajectoriesUrl).toBe(TRAJECTORIES);
    expect(out.trimmedVideoUrl).toBe(TRIMMED);
    expect(out.errorMessage).toBeNull();
  });

  test('a null trajectories_url is tolerated — the docs say it may be null', () => {
    const out = parseWebhookPayload({
      job_id: 'j',
      status: 'job_completed',
      strokes_url: STROKES,
      players_url: PLAYERS,
      trajectories_url: null,
      trimmed_video_url: TRIMMED,
    });

    expect(out.strokesUrl).toBe(STROKES);
    expect(out.playersUrl).toBe(PLAYERS);
    expect(out.trajectoriesUrl).toBeNull();
  });

  test('the pre-September shape still parses: sas_url is the strokes url', () => {
    // Stored deliveries are replayed through this parser by adopt-deliveries.ts,
    // and every delivery before the rename carries `sas_url`. Dropping the old
    // name would make those replays lose the results url.
    const out = parseWebhookPayload({
      job_id: 'j',
      status: 'job_completed',
      sas_url: STROKES,
      trimmed_video_url: TRIMMED,
      homography_score: 0.89,
      ball_detection_score: 0.889,
    });

    expect(out.strokesUrl).toBe(STROKES);
    expect(out.playersUrl).toBeNull();
    expect(out.trajectoriesUrl).toBeNull();
    expect(out.trimmedVideoUrl).toBe(TRIMMED);
  });

  test('strokes_url wins over a stale sas_url when both are present', () => {
    const out = parseWebhookPayload({
      status: 'job_completed',
      sas_url: 'https://old.example/strokes.json',
      strokes_url: STROKES,
    });
    expect(out.strokesUrl).toBe(STROKES);
  });

  test('the players url is never mistaken for the strokes url', () => {
    // `url` is the broad last-resort candidate for the strokes file. A payload
    // that carries only the per-frame files must not have one of them promoted
    // to "the results".
    const out = parseWebhookPayload({
      status: 'job_completed',
      players_url: PLAYERS,
      trajectories_url: TRAJECTORIES,
    });
    expect(out.strokesUrl).toBeNull();
    expect(out.playersUrl).toBe(PLAYERS);
  });

  test('job_queued: no urls, status advances to queued', () => {
    const out = parseWebhookPayload({
      job_id: 'j',
      video_id: 'v',
      status: 'queued',
      message: 'Job queued successfully',
      sas_url: null,
      homography_score: null,
    });

    expect(out.nextStatus).toBe('queued');
    expect(out.strokesUrl).toBeNull();
    expect(out.playersUrl).toBeNull();
    expect(out.trajectoriesUrl).toBeNull();
    expect(out.trimmedVideoUrl).toBeNull();
    expect(out.errorMessage).toBeNull();
  });

  test('job_failed: the structured error object is read, not the top-level message', () => {
    // Shape of the first real failure (2026-08-28). The top-level `message`
    // prefixes raw internals the docs say not to show; `error.message` is the
    // string designated for users, and `error.step` drives the auto-retry.
    const out = parseWebhookPayload({
      job_id: '74cea58e-2ea0-4e81-ba88-8ca796925c76',
      status: 'job_failed',
      message:
        "Failed to download video: HTTPSConnectionPool(host='x.blob.core.windows.net', port=443): Read timed out.",
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        message: 'An unexpected error occurred while processing the job.',
        detail: 'HTTPSConnectionPool(...): Read timed out.',
        step: 'downloading_video',
      },
      sas_url: null,
    });

    expect(out.nextStatus).toBe('failed');
    expect(out.errorCode).toBe('INTERNAL_ERROR');
    expect(out.errorCategory).toBe('internal');
    expect(out.errorStep).toBe('downloading_video');
    expect(out.errorMessage).toBe('An unexpected error occurred while processing the job.');
    expect(out.strokesUrl).toBeNull();
  });

  test('non-http values are rejected for every url field', () => {
    const out = parseWebhookPayload({
      status: 'job_completed',
      strokes_url: 'not a url',
      players_url: 'ftp://vendor/players.json',
      trajectories_url: 'javascript:alert(1)',
      trimmed_video_url: '',
    });
    expect(out.strokesUrl).toBeNull();
    expect(out.playersUrl).toBeNull();
    expect(out.trajectoriesUrl).toBeNull();
    expect(out.trimmedVideoUrl).toBeNull();
  });

  test('an unrecognised body yields nulls rather than throwing', () => {
    expect(() => parseWebhookPayload(null)).not.toThrow();
    expect(() => parseWebhookPayload('garbage')).not.toThrow();
    const out = parseWebhookPayload({ hello: 'world' });
    expect(out.strokesUrl).toBeNull();
    expect(out.nextStatus).toBeNull();
  });
});
