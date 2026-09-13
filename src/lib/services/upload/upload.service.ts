/**
 * Upload Service
 *
 * Orchestrates the file upload flow using provider strategies and storage service.
 * Follows Single Responsibility Principle - only handles upload orchestration.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  IUploadService,
  IProviderUploadStrategy,
  IStorageService,
  UploadRequest,
  UploadResult,
  StoragePath,
  MatchFileRecord,
  ProviderId,
} from './types';
import { getProviderStrategy } from './providers';
import { createStorageService } from './storage.service';

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

    // 1. Get provider strategy
    const strategy = this.getProviderStrategy(providerId);

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
      status: 'uploaded',
    };

    const { data, error: dbError } = await this.supabase
      .from('match_files')
      .insert(fileRecord)
      .select('id')
      .single();

    if (dbError) {
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
