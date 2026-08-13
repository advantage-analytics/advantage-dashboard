/**
 * Azure Blob + SAS strategy.
 *
 * The vendor's API docs constrain `VideoUrl` to
 * `https://<account>.blob.core.windows.net/<container>/<blob>`, "normally with a
 * SAS token", and state that other hosts are not supported. Asked directly
 * whether that was advisory, they said it was not. So this is not one of two
 * comparable options the way §3.2 of the spec framed it — it is the only shape
 * of URL they can read.
 *
 * Everything here signs with the storage account key. That is a deliberate
 * pilot-scale choice: a user delegation SAS would need a service principal and
 * an RBAC assignment, and buys only an all-or-nothing "revoke every delegation
 * key" break-glass, which is not the per-job revocation we actually lost.
 *
 * ── What we gave up, stated plainly ──────────────────────────────────────────
 * The Worker this replaces could kill one job's URL on demand. A SAS signed
 * with the account key cannot be withdrawn: the signature is verified
 * arithmetically, so the only kill switches are rotating the account key
 * (kills every URL) or deleting the blob. Container stored-access-policies
 * would give per-policy revocation, but Azure allows five per container, so
 * they cannot be per-job either.
 *
 * Two things bound the exposure instead, and neither is as good:
 *   1. VENDOR_URL_TTL_SECONDS, shortened from 30 days to 14 for this reason.
 *   2. Deleting the source blob once results are safely stored — see the
 *      webhook's after() block. Nothing deleted videos post-completion under
 *      R2 either, so that part is a net improvement.
 */

import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import type { ContainerClient } from '@azure/storage-blob';
import type { SupabaseClient } from '@supabase/supabase-js';

import { VENDOR_URL_TTL_SECONDS } from '../config';
import type {
  MintVendorUrlInput,
  VendorVideoUrl,
  VideoUrlStrategy,
} from './types';

/**
 * How long a browser upload credential lives.
 *
 * Six hours, not the one hour the R2 presign used. The validator accepts just
 * under 8 GB; at 10 Mbps that transfer takes about 1.8 hours, and the old
 * one-hour window would have expired mid-upload with nothing but a 403 on a
 * block PUT to explain it. Long enough that the ceiling is never what fails.
 */
export const UPLOAD_SAS_TTL_SECONDS = 6 * 60 * 60;

/**
 * Backdate on every SAS start time.
 *
 * Azure validates `st` against its own clock. A server running a minute fast
 * mints a credential that is not yet valid, which surfaces as an opaque 403 on
 * the first request and nowhere else.
 */
const CLOCK_SKEW_SECONDS = 5 * 60;

export interface AzureStorageConfig {
  account: string;
  accountKey: string;
  container: string;
}

/** Env var names, in one place, so the preflight gate and the client agree. */
export const AZURE_STORAGE_ENV_VARS = [
  'AZURE_STORAGE_ACCOUNT',
  'AZURE_STORAGE_KEY',
  'AZURE_STORAGE_CONTAINER',
] as const;

/**
 * Read the storage config, or report which variable is missing.
 *
 * Returns rather than throws so the submit route can turn it into a clean 503
 * before spending a job lookup and a quota reservation — see
 * resolveDeploymentConfig() in api/splitstep/jobs/route.ts.
 */
export function resolveAzureStorageConfig():
  | { ok: true; config: AzureStorageConfig }
  | { ok: false; missing: string } {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey = process.env.AZURE_STORAGE_KEY;
  const container = process.env.AZURE_STORAGE_CONTAINER;

  if (!account) return { ok: false, missing: 'AZURE_STORAGE_ACCOUNT' };
  if (!accountKey) return { ok: false, missing: 'AZURE_STORAGE_KEY' };
  if (!container) return { ok: false, missing: 'AZURE_STORAGE_CONTAINER' };

  return { ok: true, config: { account, accountKey, container } };
}

/**
 * Same, but fatal.
 *
 * Failing here is deliberate: the alternative is minting a URL against
 * `undefined.blob.core.windows.net` and only discovering it days later, via an
 * unparseable vendor error string.
 */
export function requireAzureStorageConfig(): AzureStorageConfig {
  const resolved = resolveAzureStorageConfig();

  if (!resolved.ok) {
    throw new Error(
      `${resolved.missing} is not set. Azure Blob Storage holds the source ` +
        `video and is the only host the provider will fetch from.`
    );
  }

  return resolved.config;
}

function credentialFor(config: AzureStorageConfig): StorageSharedKeyCredential {
  return new StorageSharedKeyCredential(config.account, config.accountKey);
}

/**
 * Built per call rather than memoized, deliberately.
 *
 * Measured at ~26 µs to construct, against two calls per upload — so caching it
 * would save under 0.1 ms per multi-GB transfer. It also costs no connections:
 * @azure/core-client memoizes the underlying NodeHttpClient at module scope, so
 * every client here shares one keep-alive agent and its sockets. There are no
 * extra TLS handshakes to save.
 */
function containerClientFor(config: AzureStorageConfig): ContainerClient {
  return new BlobServiceClient(
    `https://${config.account}.blob.core.windows.net`,
    credentialFor(config)
  ).getContainerClient(config.container);
}

/**
 * Sign one blob URL.
 *
 * `.url` from the SDK's client is used rather than string concatenation so the
 * blob name is percent-encoded correctly — our names are UUID path segments
 * today, but a hand-built URL would break silently the first time one is not.
 */
function signBlobUrl(params: {
  config: AzureStorageConfig;
  blobName: string;
  permissions: string;
  expiresOn: Date;
}): string {
  const { config, blobName, permissions, expiresOn } = params;

  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.container,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn: new Date(Date.now() - CLOCK_SKEW_SECONDS * 1000),
      expiresOn,
      protocol: SASProtocol.Https,
    },
    credentialFor(config)
  ).toString();

  const blobUrl = containerClientFor(config).getBlockBlobClient(blobName).url;

  return `${blobUrl}?${sas}`;
}

/**
 * A write credential for one blob, for the browser to upload against.
 *
 * `cw` — create and write, the minimum Put Block and Put Block List need. No
 * read, no delete, no list: whoever holds this URL can put bytes at exactly one
 * name and can do nothing else with the container.
 */
export function mintUploadSas(params: {
  blobName: string;
  ttlSeconds?: number;
}): { uploadUrl: string; expiresAt: Date } {
  const config = requireAzureStorageConfig();
  const ttlSeconds = params.ttlSeconds ?? UPLOAD_SAS_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  return {
    uploadUrl: signBlobUrl({
      config,
      blobName: params.blobName,
      permissions: 'cw',
      expiresOn: expiresAt,
    }),
    expiresAt,
  };
}

/**
 * Remove a source video.
 *
 * `deleteIfExists` rather than `delete`: every caller is cleanup, and all of
 * them can reach a blob that is already gone — a retried webhook, a match
 * deleted twice, a job whose upload never finished. Absence is the desired
 * state, not an error.
 */
export async function deleteVideoBlob(params: {
  blobName: string;
}): Promise<{ deleted: boolean }> {
  const response = await videoContainerClient()
    .getBlockBlobClient(params.blobName)
    .deleteIfExists();

  return { deleted: response.succeeded };
}

/** Container handle for bulk work — currently only the orphan sweeper. */
export function videoContainerClient(): ContainerClient {
  return containerClientFor(requireAzureStorageConfig());
}

export class AzureSasVideoUrlStrategy implements VideoUrlStrategy {
  readonly id = 'azure-sas' as const;

  /**
   * @param supabase Must be a service-role client. The bookkeeping write is an
   *   ownership-independent operation performed after the caller has already
   *   verified the user owns the match; an RLS-scoped client would silently
   *   match zero rows when called from a webhook or background job.
   */
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly config: AzureStorageConfig
  ) {}

  async mint({
    jobId,
    objectKey,
    ttlSeconds = VENDOR_URL_TTL_SECONDS,
  }: MintVendorUrlInput): Promise<VendorVideoUrl> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const url = signBlobUrl({
      config: this.config,
      blobName: objectKey,
      permissions: 'r',
      expiresOn: expiresAt,
    });

    // Bookkeeping only — none of this is consulted when the vendor fetches, the
    // way `video_access_token` was by the Worker. It is what lets someone
    // answer "when did we hand out a URL for this job, and had we meant to
    // withdraw it" from the row alone.
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .update({
        video_object_key: objectKey,
        video_token_issued_at: issuedAt.toISOString(),
        video_token_revoked_at: null,
        video_url_expires_at: expiresAt.toISOString(),
      })
      .eq('id', jobId)
      .select('id');

    if (error) {
      throw new Error(
        `Could not record the video URL for job ${jobId}: ${error.message}`
      );
    }

    // An update that matches nothing is not an error to PostgREST. Here it
    // means the job row is gone, so the URL we are about to hand the vendor
    // belongs to a job nothing will ever reconcile a webhook against.
    if (!data || data.length === 0) {
      throw new Error(
        `Could not record the video URL: no processing job ${jobId}.`
      );
    }

    return { url, expiresAt };
  }

  /**
   * Record that a job's URL should no longer be used.
   *
   * IMPORTANT: this does not invalidate anything. A SAS signed with the account
   * key is verified by recomputing the signature, so there is nothing to
   * withdraw — see the file header. The URL keeps working until `expiresOn`.
   * That is why it is not called `revoke`.
   *
   * It is still worth writing. The only caller is the submit-failure path in
   * api/splitstep/jobs, where the POST never reached the vendor and nobody
   * outside this system has ever seen the URL, so the recorded intent and the
   * real exposure agree. If that stops being true, the honest fix is deleting
   * the blob via deleteVideoBlob(), not extending this method.
   */
  async markUrlRetired(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processing_jobs')
      .update({ video_token_revoked_at: new Date().toISOString() })
      .eq('id', jobId)
      .is('video_token_revoked_at', null);

    if (error) {
      throw new Error(
        `Could not record the video URL revocation for job ${jobId}: ${error.message}`
      );
    }
  }
}
