/**
 * Vendor video URL — public entry point.
 *
 * Callers ask for a strategy and never name a concrete one, so swapping the
 * §3.2 choice is a change to this file alone.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VideoUrlStrategy } from './types';
import { WorkerTokenVideoUrlStrategy } from './worker-token';

export type {
  MintVendorUrlInput,
  VendorVideoUrl,
  VideoUrlStrategy,
  VideoUrlStrategyId,
} from './types';
export {
  VIDEO_ACCESS_PATH_PREFIX,
  WorkerTokenVideoUrlStrategy,
} from './worker-token';

/**
 * Build the configured vendor URL strategy.
 *
 * @param supabase A service-role client — see WorkerTokenVideoUrlStrategy.
 * @throws if the Worker origin is unset. Failing here is deliberate: the
 *   alternative is minting a URL against `undefined/v/...` and only finding out
 *   when the vendor fails to fetch it, days later, via an unparseable error
 *   string (§5 Q7).
 */
export function createVideoUrlStrategy(
  supabase: SupabaseClient
): VideoUrlStrategy {
  const workerBaseUrl = process.env.R2_PUBLIC_WORKER_URL;

  if (!workerBaseUrl) {
    throw new Error(
      'R2_PUBLIC_WORKER_URL is not set. It must be the public origin of the ' +
        'video-access Worker (see workers/video-access/README.md).'
    );
  }

  return new WorkerTokenVideoUrlStrategy(supabase, workerBaseUrl);
}
