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
 * So there is one strategy, `azure-sas` — a SAS-signed blob URL on our own
 * storage account. See azure-sas.ts for what a SAS gives up versus the Worker it
 * replaced, which is per-job revocation.
 *
 * The union stays a union rather than collapsing to a string: it is what makes
 * `id` mean something on the row, and a second entry costs one word if the
 * vendor ever widens what `VideoUrl` accepts. `worker-token` and `presigned`
 * were removed with the implementation — git has them if the ground shifts back.
 */

export type VideoUrlStrategyId = 'azure-sas';

export interface VendorVideoUrl {
  /** The URL handed to the vendor as `VideoUrl` in the job request. */
  url: string;
  /** When it stops working. `null` means the strategy imposes no expiry. */
  expiresAt: Date | null;
}

export interface MintVendorUrlInput {
  /** `processing_jobs.id` — the row the credential is bound to. */
  jobId: string;
  /** Blob name of the source video, from `videoObjectKey()`. */
  objectKey: string;
  /** Lifetime in seconds. Defaults to VENDOR_URL_TTL_SECONDS. */
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
   * Record that a job's URL should no longer be used.
   *
   * NOT named `revoke`, because under `azure-sas` nothing is revoked — a SAS is
   * verified by recomputing its signature, so the URL keeps working until it
   * expires. The name has to say that, because the paths that will eventually
   * want this (cancelling a queued job, a user deleting a match mid-processing,
   * an admin kill switch) are exactly the ones where believing the URL is dead
   * is a security error rather than an untidiness.
   *
   * To actually end access, delete the blob — see deleteVideoBlob(). These are
   * genuinely two operations: "stop advertising this URL" and "destroy the
   * video". The submit-failure path wants the first and must not do the second,
   * because a retry needs the video to still be there.
   *
   * Idempotent — marking an already-marked or never-minted job is a no-op.
   */
  markUrlRetired(jobId: string): Promise<void>;
}
