/**
 * Parser registry and factory
 * Manages file parsers for different providers
 */

import { IFileParser } from './types';
import { SwingVisionParser } from './swingvision-parser';

// Parser registry mapping provider IDs to parser instances
const parserRegistry: Map<string, IFileParser> = new Map([
  ['swing-vision', new SwingVisionParser()],
]);

/**
 * Get parser for a specific provider
 * @param providerId - The provider identifier (e.g., 'swing-vision')
 * @returns The parser instance, or undefined if not found
 */
export function getParser(providerId: string): IFileParser | undefined {
  return parserRegistry.get(providerId.toLowerCase());
}

/**
 * Check if a parser exists for a provider
 * @param providerId - The provider identifier
 * @returns True if parser exists
 */
export function hasParser(providerId: string): boolean {
  return parserRegistry.has(providerId.toLowerCase());
}

export type { IFileParser, ParseResult } from './types';
export { SwingVisionParser } from './swingvision-parser';
export type {
  SwingVisionSettingsSheet,
  SwingVisionSetData,
  SwingVisionParsedData,
  FormData,
} from './types';
