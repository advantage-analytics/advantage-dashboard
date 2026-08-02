/**
 * Provider Registry
 *
 * Central registry for all provider upload strategies.
 * Follows Open/Closed Principle - add new providers without modifying existing code.
 */

import {
  ProviderId,
  IProviderUploadStrategy,
  IImportProviderStrategy,
} from '../types';
import { swingVisionStrategy } from './swingvision';
import { splitStepStrategy } from './splitstep';

/** Registry of all provider strategies */
const providerRegistry: Map<ProviderId, IProviderUploadStrategy> = new Map<
  ProviderId,
  IProviderUploadStrategy
>([
  ['swing-vision', swingVisionStrategy],
  ['splitstep', splitStepStrategy],
  // Add more providers here:
  // ['atp-tour', atpTourStrategy],
]);

/**
 * Get provider strategy by ID
 *
 * @throws Error if provider is not found
 */
export function getProviderStrategy(providerId: ProviderId): IProviderUploadStrategy {
  const strategy = providerRegistry.get(providerId);

  if (!strategy) {
    throw new Error(`Unknown provider: ${providerId}. Available providers: ${Array.from(providerRegistry.keys()).join(', ')}`);
  }

  return strategy;
}

/**
 * Get an import provider strategy by ID.
 *
 * Use this on the parse-and-upload path. Processing providers (video sent to an
 * external analysis service) have no parseable file and must never reach that
 * code — they are rejected here rather than failing further downstream.
 *
 * @throws Error if the provider is unknown or is not an import provider
 */
export function getImportProviderStrategy(
  providerId: ProviderId
): IImportProviderStrategy {
  const strategy = getProviderStrategy(providerId);

  if (strategy.kind !== 'import') {
    throw new Error(
      `Provider ${providerId} is a ${strategy.kind} provider and cannot be used for direct file import.`
    );
  }

  return strategy;
}

/**
 * Check if provider is supported
 */
export function isProviderSupported(providerId: string): providerId is ProviderId {
  return providerRegistry.has(providerId as ProviderId);
}

/**
 * Get all supported provider IDs
 */
export function getSupportedProviders(): ProviderId[] {
  return Array.from(providerRegistry.keys());
}

/** Provider kind, without needing the whole strategy. */
export function getProviderKind(providerId: ProviderId) {
  return getProviderStrategy(providerId).kind;
}

// Re-export individual strategies for direct access if needed
export { swingVisionStrategy } from './swingvision';
export { splitStepStrategy } from './splitstep';
