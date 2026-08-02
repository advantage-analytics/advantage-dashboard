/**
 * Upload Service Module
 *
 * Public API for the upload service.
 * Re-exports types and factory functions.
 */

// Types
export type {
  ProviderId,
  ProviderKind,
  ValidationResult,
  UploadResult,
  ProviderConfig,
  UploadRequest,
  StoragePath,
  MatchFileRecord,
  IProviderUploadStrategy,
  IImportProviderStrategy,
  IProcessingProviderStrategy,
  IStorageService,
  IUploadService,
} from './types';

// Services
export { createUploadService, UploadService } from './upload.service';
export { createStorageService, SupabaseStorageService } from './storage.service';

// Providers
export {
  getProviderStrategy,
  getImportProviderStrategy,
  getProviderKind,
  isProviderSupported,
  getSupportedProviders,
  swingVisionStrategy,
  splitStepStrategy,
} from './providers';
