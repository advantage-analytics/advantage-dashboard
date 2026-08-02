/**
 * Vendor video URL strategy (spec §3.2).
 *
 * The vendor needs a URL it can GET the source video from. How that URL is
 * minted is deliberately behind an interface: the pilot ships `worker-token`,
 * but the choice is reversible without touching submission or the webhook.
 *
 * The two shapes the spec weighed:
 *
 *   worker-token  A Worker on our own domain fronting R2, opaque token in the
 *                 path. No expiry ceiling, revocable, and every fetch is logged.
 *                 Chosen — see the migration header for why.
 *
 *   presigned     An S3-style SigV4 presigned GET against R2's S3-compatible
 *                 endpoint. Nothing to deploy, but capped at 7 days, cannot be
 *                 revoked once minted, and gives no signal that the vendor ever
 *                 fetched the file. Not implemented.
 */

export type VideoUrlStrategyId = 'worker-token' | 'presigned';

export interface VendorVideoUrl {
  /** The URL handed to the vendor as `VideoUrl` in the job request. */
  url: string;
  /** When it stops working. `null` means the strategy imposes no expiry. */
  expiresAt: Date | null;
}

export interface MintVendorUrlInput {
  /** `processing_jobs.id` — the row the credential is bound to. */
  jobId: string;
  /** R2 key of the source video, from `videoObjectKey()`. */
  objectKey: string;
  /**
   * Lifetime in seconds. Defaults to VENDOR_URL_TTL_SECONDS. A strategy may
   * cap this — `presigned` cannot honour anything above 7 days.
   */
  ttlSeconds?: number;
}

export interface VideoUrlStrategy {
  readonly id: VideoUrlStrategyId;

  /**
   * Issue a vendor-facing URL for a job's video and persist whatever is needed
   * to validate it later.
   *
   * Minting again for the same job replaces the previous credential — the old
   * URL stops working immediately. That is what makes retry-with-a-fresh-URL
   * safe.
   */
  mint(input: MintVendorUrlInput): Promise<VendorVideoUrl>;

  /**
   * Retire a job's URL ahead of its expiry. Call this when a job reaches a
   * terminal state so the credential's real lifetime is the job's, not the TTL.
   *
   * Idempotent — revoking an already-revoked or never-minted job is a no-op.
   */
  revoke(jobId: string): Promise<void>;
}
