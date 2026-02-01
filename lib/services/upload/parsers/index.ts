/**
 * Parser registry and factory
 * Manages file parsers for different providers
 */

import { IFileParser } from './types';

// Lazy load parser to avoid bundling exceljs in server components
let parserRegistry: Map<string, IFileParser> | null = null;

async function getParserRegistry(): Promise<Map<string, IFileParser>> {
  if (parserRegistry) {
    return parserRegistry;
  }

  // Dynamic import to avoid bundling exceljs in server-side code
  const { SwingVisionParser } = await import('./swingvision-parser');
  
  parserRegistry = new Map([
    ['swing-vision', new SwingVisionParser()],
  ]);

  return parserRegistry;
}

/**
 * Get parser for a specific provider
 * @param providerId - The provider identifier (e.g., 'swing-vision')
 * @returns The parser instance, or undefined if not found
 */
export async function getParser(providerId: string): Promise<IFileParser | undefined> {
  const registry = await getParserRegistry();
  return registry.get(providerId.toLowerCase());
}

/**
 * Check if a parser exists for a provider
 * @param providerId - The provider identifier
 * @returns True if parser exists
 */
export async function hasParser(providerId: string): Promise<boolean> {
  const registry = await getParserRegistry();
  return registry.has(providerId.toLowerCase());
}

export type { IFileParser, ParseResult } from './types';
export { SwingVisionParser } from './swingvision-parser';
export type {
  SwingVisionSettingsSheet,
  SwingVisionSetData,
  SwingVisionParsedData,
  FormData,
} from './types';
