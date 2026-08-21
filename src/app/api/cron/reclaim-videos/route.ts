/**
 * Daily reclamation of source videos a trimmed copy has replaced.
 *
 * Scheduled from vercel.json. This exists because the webhook cannot do it: it
 * starts an Azure server-side copy and returns long before a multi-gigabyte
 * transfer finishes, so its own delete almost always declines. Without a
 * scheduled pass, every completed match kept ~5 GB indefinitely.
 *
 * All the work is in reclaimSupersededSources(), which
 * scripts/cleanup-orphan-storage.ts also calls — one definition of "is this
 * source video safe to remove", rather than a route and a script agreeing by
 * hand.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { reclaimSupersededSources } from '@/lib/services/splitstep/reclaim-videos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOG = '[cron:reclaim-videos]';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Fails CLOSED when unconfigured, which is the opposite of the webhook and
  // deliberately so. The webhook accepts an unverifiable delivery because a
  // refused one is gone permanently — there is no retry. Here the endpoint
  // DELETES, the repo is public so the path is known, and a skipped run simply
  // happens tomorrow. Different cost of being wrong, different default.
  if (!secret) {
    console.error(
      `${LOG} CRON_SECRET is not set — refusing to run. Set it in Vercel; ` +
        `the platform sends it as "Authorization: Bearer <secret>".`
    );
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await reclaimSupersededSources({
    supabase: createAdminClient(),
    apply: true,
    log: (line) => console.log(`${LOG} ${line}`),
  });

  if (outcome.broken.length > 0) {
    // Loud, and separated from the pending count on purpose. A `failed` or
    // `aborted` copy means the job points at a trimmed video that does not
    // exist, and trimmed_video_url — the only way to fetch it again — expires
    // about a week after the completion. After that the video is unrecoverable.
    console.error(
      `${LOG} ${outcome.broken.length} trimmed copy/copies FAILED — re-copy from ` +
        `trimmed_video_url on these jobs before it expires`,
      outcome.broken
    );
  }

  const summary = {
    examined: outcome.examined,
    eligible: outcome.eligible,
    reclaimed: outcome.reclaimed,
    pending: outcome.pending,
    broken: outcome.broken.length,
  };

  // `eligible` and `reclaimed` differing means a delete threw. Worth seeing in
  // the response as well as the log, since the cron's own output is the only
  // routine signal anyone reads.
  console.log(`${LOG} done`, summary);

  return NextResponse.json(summary);
}
