/**
 * Vendor video URL — public entry point.
 *
 * Callers ask for a strategy and never name a concrete one, which is why
 * replacing the storage provider outright was a change to this file and one new
 * implementation, and touched neither submission nor the webhook.
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
export {
  AZURE_STORAGE_ENV_VARS,
  AzureSasVideoUrlStrategy,
  UPLOAD_SAS_TTL_SECONDS,
  deleteVideoBlob,
  mintUploadSas,
  requireAzureStorageConfig,
  resolveAzureStorageConfig,
  videoContainerClient,
} from './azure-sas';
export type { AzureStorageConfig } from './azure-sas';

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
