/**
 * Vendor video URL strategy.
 *
 * The vendor needs a URL it can GET the source video from. How that URL is
 * minted sits behind an interface, which is the one thing spec §3.2 got right:
 * it weighed two ways to serve the file from our own infrastructure, and said
 * "implement behind an interface either way". That hedge is why swapping the
 * storage provider outright touched neither submission nor the webhook.
 *
 * What §3.2 never asked was what hosts the vendor's `VideoUrl` field accepts.
 * The answer, in their API docs and confirmed by email, is Azure Blob Storage
 * and nothing else — so the comparison it did make was moot.
 *
 *   azure-sas     A SAS-signed blob URL on our Azure storage account. The only
 *                 shape the vendor can fetch, and therefore the only strategy
 *                 in use. See azure-sas.ts for what SAS gives up versus the
 *                 Worker it replaced.
 *
 *   worker-token  A Cloudflare Worker fronting R2, opaque token in the path.
 *                 Revocable per job and logged every fetch. Retired: the vendor
 *                 will not read from our host.
 *
 *   presigned     An S3-style SigV4 presigned GET against R2. Never
 *                 implemented, and now unimplementable for the same reason.
 */

export type VideoUrlStrategyId = 'azure-sas' | 'worker-token' | 'presigned';

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
