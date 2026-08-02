/**
 * Worker + opaque token strategy (spec §3.2, option b).
 *
 * Mints a random token, stores it on the job row, and hands the vendor a URL
 * pointing at our Worker rather than at R2. The Worker trades the token for an
 * object key via `resolve_video_access_token()` and streams the file — see
 * workers/video-access/.
 *
 * Nothing about the token is derived from the job, match, or user. It is a
 * bearer credential and leaks nothing if intercepted beyond access to one video
 * the holder could not otherwise name.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { VENDOR_URL_TTL_SECONDS } from '../config';
import type {
  MintVendorUrlInput,
  VendorVideoUrl,
  VideoUrlStrategy,
} from './types';

/**
 * Path the Worker serves tokens under. The Worker hardcodes the same prefix —
 * it cannot import from `src/`, so changing this means changing both.
 */
export const VIDEO_ACCESS_PATH_PREFIX = '/v/';

/** Bytes of entropy in an access token. 32 is well past brute-force range. */
const TOKEN_BYTES = 32;

/** URL-safe base64 without padding, so the token drops into a path unescaped. */
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintAccessToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export class WorkerTokenVideoUrlStrategy implements VideoUrlStrategy {
  readonly id = 'worker-token' as const;

  private readonly workerBaseUrl: string;

  /**
   * @param supabase Must be a service-role client. The token write is an
   *   ownership-independent operation performed after the caller has already
   *   verified the user owns the match; an RLS-scoped client would silently
   *   match zero rows when called from a webhook or background job.
   */
  constructor(
    private readonly supabase: SupabaseClient,
    workerBaseUrl: string
  ) {
    this.workerBaseUrl = workerBaseUrl.replace(/\/+$/, '');
  }

  async mint({
    jobId,
    objectKey,
    ttlSeconds = VENDOR_URL_TTL_SECONDS,
  }: MintVendorUrlInput): Promise<VendorVideoUrl> {
    const token = mintAccessToken();
    const issuedAt = new Date();
    const expiresAt =
      ttlSeconds > 0
        ? new Date(issuedAt.getTime() + ttlSeconds * 1000)
        : null;

    const { data, error } = await this.supabase
      .from('processing_jobs')
      .update({
        video_access_token: token,
        video_object_key: objectKey,
        video_token_issued_at: issuedAt.toISOString(),
        // Re-minting after a revoke must produce a working URL again.
        video_token_revoked_at: null,
        video_url_expires_at: expiresAt?.toISOString() ?? null,
      })
      .eq('id', jobId)
      .select('id');

    if (error) {
      throw new Error(
        `Could not issue a video access token for job ${jobId}: ${error.message}`
      );
    }

    // An update that matches nothing is not an error to PostgREST, but it means
    // the token was never stored and the URL we are about to return is dead.
    if (!data || data.length === 0) {
      throw new Error(
        `Could not issue a video access token: no processing job ${jobId}.`
      );
    }

    return {
      url: `${this.workerBaseUrl}${VIDEO_ACCESS_PATH_PREFIX}${token}`,
      expiresAt,
    };
  }

  async revoke(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processing_jobs')
      .update({ video_token_revoked_at: new Date().toISOString() })
      .eq('id', jobId)
      .is('video_token_revoked_at', null);

    if (error) {
      throw new Error(
        `Could not revoke the video access token for job ${jobId}: ${error.message}`
      );
    }
  }
}
