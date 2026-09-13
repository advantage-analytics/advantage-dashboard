/**
 * Storage Service
 *
 * Abstracts Supabase storage operations.
 * Implements IStorageService interface for testability.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IStorageService, UploadResult } from './types';

/** Storage bucket name for match data */
const MATCH_DATA_BUCKET = 'match-data';

/**
 * Supabase Storage Service Implementation
 *
 * Wraps Supabase storage client with a clean interface.
 * Can be easily mocked for testing.
 */
export class SupabaseStorageService implements IStorageService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Upload file to storage bucket
   */
  async upload(
    path: string,
    file: File | Blob,
    options?: { upsert?: boolean }
  ): Promise<UploadResult> {
    try {
      const { data, error } = await this.supabase.storage
        .from(MATCH_DATA_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: options?.upsert ?? false,
        });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        storagePath: data.path,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown upload error',
      };
    }
  }

  /**
   * Delete file from storage bucket
   */
  async delete(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.storage
        .from(MATCH_DATA_BUCKET)
        .remove([path]);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown delete error',
      };
    }
  }

  /**
   * Check if file exists in storage
   */
  async exists(path: string): Promise<boolean> {
    try {
      // Extract folder and filename from path
      const pathParts = path.split('/');
      const fileName = pathParts.pop();
      const folderPath = pathParts.join('/');

      const { data, error } = await this.supabase.storage
        .from(MATCH_DATA_BUCKET)
        .list(folderPath);

      if (error || !data) {
        return false;
      }

      return data.some((file) => file.name === fileName);
    } catch {
      return false;
    }
  }

  /**
   * Get public URL for file
   */
  getPublicUrl(path: string): string {
    const { data } = this.supabase.storage
      .from(MATCH_DATA_BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }
}

/**
 * Factory function to create storage service
 */
export function createStorageService(supabase: SupabaseClient): IStorageService {
  return new SupabaseStorageService(supabase);
}
