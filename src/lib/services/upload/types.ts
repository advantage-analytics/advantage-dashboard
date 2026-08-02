/**
 * Upload Service Type Definitions
 *
 * Defines contracts for the upload system following Interface Segregation Principle.
 * Each interface has a single, focused responsibility.
 */

import type { VideoProbe } from '@/lib/video/probe';

/** Supported data providers */
export type ProviderId = 'swing-vision' | 'atp-tour' | 'splitstep';

/**
 * How a provider gets match data into the system.
 *
 * - `import` — the user supplies a parseable file we read directly (SwingVision
 *   xlsx). Validation is synchronous and the file is the data.
 * - `processing` — the user supplies a video we send to an external analysis
 *   service, which returns results asynchronously via webhook. Validation must
 *   await media metadata, and the file is an input to a job, not the data.
 */
export type ProviderKind = 'import' | 'processing';

/** File validation result */
export interface ValidationResult {
  success: boolean;
  error?: string;
  /**
   * Non-fatal findings the user should see but which do not block submission —
   * e.g. a frame rate the browser could not determine, or one that meets the
   * floor but sits below the vendor's recommendation.
   */
  warnings?: string[];
  details?: {
    sheetsValidated?: string[];
    totalRows?: Record<string, number>;
    validationErrors?: string[];
    /** Populated by processing providers after probing the media. */
    video?: VideoProbe;
  };
}

/** File upload result */
export interface UploadResult {
  success: boolean;
  storagePath?: string;
  fileId?: string;
  error?: string;
}

/**
 * Provider-specific configuration.
 *
 * Note there is no `kind` here — the discriminant lives on the strategy
 * (`strategy.kind`), which is what every call site narrows on. Duplicating it
 * onto the config would be a second source of truth that can silently disagree.
 */
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

/** Shared surface for every provider strategy. */
interface IProviderStrategyBase {
  readonly config: ProviderConfig;

  /** Get the accepted file input accept string */
  getAcceptString(): string;
}

/**
 * Import Provider Strategy
 *
 * For providers whose file we parse directly. Validation is synchronous: an
 * extension, MIME type and size check is everything that can be done before
 * the file is read.
 */
export interface IImportProviderStrategy extends IProviderStrategyBase {
  readonly kind: 'import';

  /** Validate file before upload (client-side checks) */
  validateFile(file: File): ValidationResult;
}

/**
 * Processing Provider Strategy
 *
 * For providers that analyse a video asynchronously and return results via
 * webhook. Validation is necessarily async — resolution and frame rate are only
 * available once the browser has decoded the media's metadata, and rejecting a
 * file after a multi-gigabyte upload is the worst failure in the pipeline.
 */
export interface IProcessingProviderStrategy extends IProviderStrategyBase {
  readonly kind: 'processing';

  /**
   * Shortest analysable clip, in seconds.
   *
   * Lives here rather than being imported from a vendor's config module so the
   * upload wizard — which is written against `kind`, not against a specific
   * provider — never has to know whose floor it is enforcing.
   */
  readonly minTrimSeconds: number;

  /**
   * Short human-readable media requirements, for display next to the picker.
   *
   * Owned by the provider so the copy shown to the user and the thresholds the
   * validator enforces cannot drift — the failure being avoided is promising
   * "30fps minimum" on screen while rejecting at a different number.
   */
  readonly requirementChips: readonly string[];

  /** Validate file before upload (probes media metadata) */
  validateFile(file: File): Promise<ValidationResult>;

  /** Chargeable duration of a trim window, per the provider's rounding rules. */
  billableSeconds(startSeconds: number, endSeconds: number): number;
}

/**
 * Provider Upload Strategy
 *
 * Discriminated union over `kind`. Call sites that assume a parseable file must
 * narrow to `import` first — that is what keeps a video from reaching the xlsx
 * parse-and-upload path.
 */
export type IProviderUploadStrategy =
  | IImportProviderStrategy
  | IProcessingProviderStrategy;

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
