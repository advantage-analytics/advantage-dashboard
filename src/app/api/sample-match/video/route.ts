/**
 * `GET /api/sample-match/video` — a fresh read-only URL for the sample
 * match's bundled clip, for anyone signed in. The report at
 * `/dashboard/matches/sample` has placeholder ids that name no row, so its
 * Film view renews its credential here instead of at
 * `/api/matches/[matchId]/video`, and gets back the same envelope.
 *
 * Wiring only. The blob name, the TTL, the session gate and the 503 for a
 * deployment without Azure all live in `lib/services/sample-match/video.ts`,
 * which the spec drives with no session and no Azure.
 *
 * `GET` takes no request on purpose: nothing a caller sends — not the query,
 * not a header, not a body — reaches the handler, so there is no path by
 * which this route could be asked to sign any other object.
 */

import { handleGetSampleVideo } from "@/lib/services/sample-match/video";
import { mintPlaybackSas } from "@/lib/services/splitstep/video-url/azure-sas";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  return handleGetSampleVideo({ supabase, mintSas: mintPlaybackSas });
}
