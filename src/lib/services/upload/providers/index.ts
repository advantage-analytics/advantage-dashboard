/**
 * Provider Registry
 *
 * Central registry for all provider upload strategies.
 * Follows Open/Closed Principle - add new providers without modifying existing code.
 */

import { ProviderId, IProviderUploadStrategy } from '../types';
import { swingVisionStrategy } from './swingvision';

/** Registry of all provider strategies */
const providerRegistry: Map<ProviderId, IProviderUploadStrategy> = new Map([
  ['swing-vision', swingVisionStrategy],
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

// Re-export individual strategies for direct access if needed
export { swingVisionStrategy } from './swingvision';
