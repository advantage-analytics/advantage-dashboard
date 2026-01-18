/**
 * Upload Service Module
 *
 * Public API for the upload service.
 * Re-exports types and factory functions.
 */

// Types
export type {
  ProviderId,
  ValidationResult,
  UploadResult,
  ProviderConfig,
  UploadRequest,
  StoragePath,
  MatchFileRecord,
  IProviderUploadStrategy,
  IStorageService,
  IUploadService,
} from './types';

// Services
export { createUploadService, UploadService } from './upload.service';
export { createStorageService, SupabaseStorageService } from './storage.service';

// Providers
export {
  getProviderStrategy,
  isProviderSupported,
  getSupportedProviders,
  swingVisionStrategy,
} from './providers';
