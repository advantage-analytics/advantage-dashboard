/**
 * Upload Service Type Definitions
 *
 * Defines contracts for the upload system following Interface Segregation Principle.
 * Each interface has a single, focused responsibility.
 */

/** Supported data providers */
export type ProviderId = 'swing-vision' | 'atp-tour';

/** File validation result */
export interface ValidationResult {
  success: boolean;
  error?: string;
  details?: {
    sheetsValidated?: string[];
    totalRows?: Record<string, number>;
    validationErrors?: string[];
  };
}

/** File upload result */
export interface UploadResult {
  success: boolean;
  storagePath?: string;
  fileId?: string;
  error?: string;
}

/** Provider-specific configuration */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  acceptedFileTypes: string[];
  acceptedMimeTypes: string[];
  maxFileSizeMB: number;
  requiredSheets?: string[];
}

/** Upload request payload */
export interface UploadRequest {
  file: File;
  userId: string;
  matchId: string;
  providerId: ProviderId;
}

/** Storage path components */
export interface StoragePath {
  userId: string;
  providerId: ProviderId;
  matchId: string;
  fileName: string;
}

/** Match file record for database */
export interface MatchFileRecord {
  id?: string;
  match_id: string;
  provider_id: string;
  file_name: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string;
  status: 'uploading' | 'uploaded' | 'validated' | 'failed';
}

/**
 * Provider Upload Strategy Interface
 *
 * Defines the contract for provider-specific upload handling.
 * Follows Strategy Pattern for extensibility.
 */
export interface IProviderUploadStrategy {
  readonly config: ProviderConfig;

  /** Validate file before upload (client-side checks) */
  validateFile(file: File): ValidationResult;

  /** Get the accepted file input accept string */
  getAcceptString(): string;
}

/**
 * Storage Service Interface
 *
 * Abstracts Supabase storage operations for testability and flexibility.
 */
export interface IStorageService {
  /** Upload file to storage bucket */
  upload(path: string, file: File | Blob, options?: { upsert?: boolean }): Promise<UploadResult>;

  /** Delete file from storage bucket */
  delete(path: string): Promise<{ success: boolean; error?: string }>;

  /** Check if file exists */
  exists(path: string): Promise<boolean>;

  /** Get public URL for file */
  getPublicUrl(path: string): string;
}

/**
 * Upload Service Interface
 *
 * Orchestrates the upload flow using provider strategies and storage service.
 */
export interface IUploadService {
  /** Upload file for a specific provider */
  uploadMatchFile(request: UploadRequest): Promise<UploadResult>;

  /** Get provider strategy by ID */
  getProviderStrategy(providerId: ProviderId): IProviderUploadStrategy;

  /** Build storage path from components */
  buildStoragePath(components: StoragePath): string;
}
