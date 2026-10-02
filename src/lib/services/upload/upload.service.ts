/**
 * Upload Service
 *
 * Orchestrates the file upload flow using provider strategies and storage service.
 * Follows Single Responsibility Principle - only handles upload orchestration.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  IUploadService,
  IProviderUploadStrategy,
  IStorageService,
  UploadRequest,
  UploadResult,
  StoragePath,
  MatchFileRecord,
  ProviderId,
} from "./types";
import { getProviderStrategy, getImportProviderStrategy } from "./providers";
import { createStorageService } from "./storage.service";

/**
 * Upload Service Implementation
 *
 * Coordinates between provider strategies, storage service, and database.
 */
export class UploadService implements IUploadService {
  private readonly storageService: IStorageService;

  constructor(private readonly supabase: SupabaseClient) {
    this.storageService = createStorageService(supabase);
  }

  /**
   * Upload match file to storage and create database record
   *
   * Flow:
   * 1. Get provider strategy
   * 2. Validate file (client-side checks)
   * 3. Build storage path
   * 4. Upload to storage
   * 5. Create database record
   */
  async uploadMatchFile(request: UploadRequest): Promise<UploadResult> {
    const { file, userId, matchId, providerId } = request;

    // 1. Get provider strategy. Import-only: this method uploads a parseable
    //    file to the match-data bucket, which is meaningless for a processing
    //    provider whose video goes through the job pipeline instead.
    const strategy = getImportProviderStrategy(providerId);

    // 2. Validate file
    const validationResult = strategy.validateFile(file);
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error,
      };
    }

    // 3. Build storage path
    const storagePath = this.buildStoragePath({
      userId,
      providerId,
      matchId,
      fileName: file.name,
    });

    // 4. Upload to storage
    const uploadResult = await this.storageService.upload(storagePath, file, {
      upsert: true,
    });

    if (!uploadResult.success) {
      return uploadResult;
    }

    // 5. Create database record
    const fileRecord: MatchFileRecord = {
      match_id: matchId,
      provider_id: providerId,
      file_name: file.name,
      file_size: file.size,
      storage_path: storagePath,
      uploaded_by: userId,
      status: "uploaded",
    };

    const { data, error: dbError } = await this.supabase
      .from("match_files")
      .insert(fileRecord)
      .select("id")
      .single();

    if (dbError) {
      // Unique violation on `match_files_one_per_match`: another upload for
      // this match committed its row between the route's pre-check and this
      // insert (two tabs, or a double-submit). Matched on SQLSTATE, never on
      // the message. The object this call just wrote is removed ONLY when the
      // survivor's `storage_path` differs from ours — both tabs uploading the
      // same file name share one path under `upsert: true`, so an
      // unconditional delete would remove the winner's file before
      // `process-match` downloads it. The survivor is visible through the
      // caller's own client because both uploads are the same user
      // (`match_files` "Users can view own files"); if that read fails or
      // answers empty the object is left in place rather than risk deleting
      // the winner's bytes.
      if (dbError.code === "23505") {
        const { data: survivors } = await this.supabase
          .from("match_files")
          .select("storage_path")
          .eq("match_id", matchId)
          .limit(1);
        const survivorPath = survivors?.[0]?.storage_path;
        if (typeof survivorPath === "string" && survivorPath !== storagePath) {
          await this.storageService.delete(storagePath);
        }
        return {
          success: false,
          code: "conflict",
          error: "This match already has a file",
        };
      }

      // Cleanup: remove uploaded file if DB insert fails
      await this.storageService.delete(storagePath);
      return {
        success: false,
        error: `Database error: ${dbError.message}`,
      };
    }

    return {
      success: true,
      storagePath,
      fileId: data.id,
    };
  }

  /**
   * Get provider strategy by ID
   */
  getProviderStrategy(providerId: ProviderId): IProviderUploadStrategy {
    return getProviderStrategy(providerId);
  }

  /**
   * Build storage path from components
   *
   * Path structure: {userId}/{providerId}/{matchId}/{fileName}
   * This allows:
   * - User-level RLS policies (check first folder = user ID)
   * - Provider organization
   * - Match-specific file grouping
   */
  buildStoragePath(components: StoragePath): string {
    const { userId, providerId, matchId, fileName } = components;
    return `${userId}/${providerId}/${matchId}/${fileName}`;
  }
}

/**
 * Factory function to create upload service
 */
export function createUploadService(supabase: SupabaseClient): IUploadService {
  return new UploadService(supabase);
}
