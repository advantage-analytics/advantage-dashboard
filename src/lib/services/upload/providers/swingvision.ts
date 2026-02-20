/**
 * SwingVision Provider Upload Strategy
 *
 * Implements provider-specific upload logic for SwingVision data files.
 * SwingVision exports match data as .xlsx files with specific sheet structure.
 */

import {
  IProviderUploadStrategy,
  ProviderConfig,
  ValidationResult,
} from '../types';

/** Required sheets in SwingVision export files */
const SWINGVISION_REQUIRED_SHEETS = [
  'Settings',
  'Shots',
  'Points',
  'Games',
  'Sets',
  'Stats',
] as const;

/** SwingVision provider configuration */
const SWINGVISION_CONFIG: ProviderConfig = {
  id: 'swing-vision',
  name: 'SwingVision',
  acceptedFileTypes: ['.xlsx'],
  acceptedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  maxFileSizeMB: 50,
  requiredSheets: [...SWINGVISION_REQUIRED_SHEETS],
};

/**
 * SwingVision Upload Strategy
 *
 * Handles client-side validation and configuration for SwingVision files.
 * Server-side validation (sheet structure) is handled by the Python validation endpoint.
 */
export class SwingVisionUploadStrategy implements IProviderUploadStrategy {
  readonly config: ProviderConfig = SWINGVISION_CONFIG;

  /**
   * Validate file before upload (client-side checks only)
   *
   * Performs quick validation that can be done without parsing the file:
   * - File extension
   * - MIME type
   * - File size
   *
   * Deep validation (sheet structure) is done server-side after upload.
   */
  validateFile(file: File): ValidationResult {
    // Check file extension
    const fileName = file.name.toLowerCase();
    const hasValidExtension = this.config.acceptedFileTypes.some((ext) =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return {
        success: false,
        error: `Invalid file type. SwingVision requires ${this.config.acceptedFileTypes.join(', ')} files.`,
      };
    }

    // Check MIME type (browsers may report different MIME types)
    const validMimeTypes = [
      ...this.config.acceptedMimeTypes,
      'application/octet-stream', // Some browsers report this for xlsx
      '', // Some browsers don't report MIME type
    ];

    if (file.type && !validMimeTypes.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file format. Expected Excel file (.xlsx), got: ${file.type}`,
      };
    }

    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > this.config.maxFileSizeMB) {
      return {
        success: false,
        error: `File too large. Maximum size is ${this.config.maxFileSizeMB}MB, got ${fileSizeMB.toFixed(2)}MB.`,
      };
    }

    // Validate filename characters (prevent path traversal)
    const validFilenamePattern = /^[a-zA-Z0-9\s\-_().]+\.xlsx$/i;
    if (!validFilenamePattern.test(file.name)) {
      return {
        success: false,
        error: 'Invalid filename. Use only letters, numbers, spaces, hyphens, underscores, and parentheses.',
      };
    }

    return { success: true };
  }

  /**
   * Get accept string for file input element
   */
  getAcceptString(): string {
    return this.config.acceptedFileTypes.join(',');
  }
}

/** Singleton instance for reuse */
export const swingVisionStrategy = new SwingVisionUploadStrategy();
