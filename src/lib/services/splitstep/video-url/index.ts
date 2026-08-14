/**
 * Video storage — public entry point.
 *
 * Submission asks for a strategy and never names a concrete one, so swapping R2
 * for Azure left api/splitstep/jobs' minting untouched.
 *
 * Be honest about the limit of that, though: the interface only ever covered
 * handing the vendor a read URL. Uploading and deleting are separate exported
 * functions, so the webhook grew a delete call and submission grew a config
 * check when the provider changed. A strategy interface that covers one of
 * three storage operations buys less than its name suggests — worth collapsing
 * into plain functions over one resolved config if this is ever revisited.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VideoUrlStrategy } from './types';
import {
  AzureSasVideoUrlStrategy,
  requireAzureStorageConfig,
} from './azure-sas';

export type {
  MintVendorUrlInput,
  VendorVideoUrl,
  VideoUrlStrategy,
  VideoUrlStrategyId,
} from './types';

/**
 * The storage operations callers actually use. Everything else in azure-sas.ts
 * — the strategy class, the TTL constant, the throwing config resolver — is an
 * internal that this module composes, and re-exporting it would make the
 * barrel's surface bigger than its contract.
 */
export {
  AZURE_STORAGE_ENV_VARS,
  deleteVideoBlob,
  mintUploadSas,
  resolveAzureStorageConfig,
  startTrimmedVideoCopy,
  trimmedCopyStatus,
  videoContainerClient,
} from './azure-sas';
export type { BlobCopyStatus } from './azure-sas';

/**
 * Build the configured vendor URL strategy.
 *
 * @param supabase A service-role client — see AzureSasVideoUrlStrategy.
 * @throws if the Azure storage config is incomplete. Failing here is
 *   deliberate: the alternative is minting a URL against
 *   `undefined.blob.core.windows.net` and only finding out when the vendor
 *   fails to fetch it, days later, via an unparseable error string.
 */
export function createVideoUrlStrategy(
  supabase: SupabaseClient
): VideoUrlStrategy {
  return new AzureSasVideoUrlStrategy(supabase, requireAzureStorageConfig());
}
