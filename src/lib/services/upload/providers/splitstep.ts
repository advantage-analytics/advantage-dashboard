/**
 * Advantage Intelligence (SplitStep) Provider Strategy
 *
 * A *processing* provider: the user supplies match video, we send it to an
 * external computer-vision service, and results arrive asynchronously by
 * webhook. There is no file for us to parse — the video is an input to a job,
 * not the data itself.
 *
 * Internally this provider is `splitstep`. Every user-visible string says
 * "Advantage Intelligence" (see config.PROVIDER_DISPLAY_NAME).
 */

import {
  IProcessingProviderStrategy,
  ProviderConfig,
  ValidationResult,
} from '../types';
import { validateSplitStepVideo } from '../validators/splitstep-validator';
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  MIN_TRIM_DURATION_SECONDS,
  MIN_VIDEO_FPS,
  MIN_VIDEO_HEIGHT,
  PROVIDER_DISPLAY_NAME,
} from '@/lib/services/splitstep/config';

const SPLITSTEP_CONFIG: ProviderConfig = {
  id: 'splitstep',
  name: PROVIDER_DISPLAY_NAME,
  acceptedFileTypes: [...ACCEPTED_VIDEO_EXTENSIONS],
  acceptedMimeTypes: [...ACCEPTED_VIDEO_MIME_TYPES],
  maxFileSizeMB: Math.floor(MAX_VIDEO_SIZE_BYTES / (1024 * 1024)),
};

export class SplitStepUploadStrategy implements IProcessingProviderStrategy {
  readonly kind = 'processing' as const;
  readonly config: ProviderConfig = SPLITSTEP_CONFIG;
  readonly minTrimSeconds = MIN_TRIM_DURATION_SECONDS;

  // Interpolated from the same constants the validator checks against, so
  // relaxing a floor updates the promise and the enforcement together.
  readonly requirementChips = [
    ACCEPTED_VIDEO_EXTENSIONS.map((e) => e.replace(".", "").toUpperCase()).join(" / "),
    `${MIN_VIDEO_HEIGHT}p or higher`,
    `${MIN_VIDEO_FPS}fps minimum`,
  ] as const;

  /** Whole seconds, rounded up — we are billed for any partial second. */
  billableSeconds(startSeconds: number, endSeconds: number): number {
    return Math.max(0, Math.ceil(endSeconds - startSeconds));
  }

  /**
   * Validate a video before any bytes move.
   *
   * Async by necessity: resolution and frame rate require decoding the file's
   * metadata. See validators/splitstep-validator.ts for the fatal/warning split.
   */
  async validateFile(file: File): Promise<ValidationResult> {
    return validateSplitStepVideo(file);
  }

  /**
   * Accept string for the file input.
   *
   * Both MIME types and extensions are offered: macOS reports `video/quicktime`
   * for .mov, while some Android pickers report nothing at all and match only
   * on extension.
   */
  getAcceptString(): string {
    return [
      ...this.config.acceptedMimeTypes,
      ...this.config.acceptedFileTypes,
    ].join(',');
  }
}

/** Singleton instance for reuse */
export const splitStepStrategy = new SplitStepUploadStrategy();
