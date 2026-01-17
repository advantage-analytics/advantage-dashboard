/**
 * Parser type definitions and interfaces
 */

import { FormData } from '@/components/dashboard/home/upload-match-modal/types';

export type { FormData };

export interface ParseResult {
  success: boolean;
  data?: Partial<FormData>;
  error?: string;
  warnings: string[];
}

export interface IFileParser {
  parse(file: File): Promise<ParseResult>;
  canParse(file: File): Promise<boolean>;
}

export interface SwingVisionSettingsSheet {
  hostTeam: string;
  guestTeam: string;
  guestTeamFromFallback?: boolean;
  adScoring: boolean;
  startTime?: string;
  endTime?: string;
  location?: string;
}

export interface SwingVisionSetData {
  setNumber: number;
  hostScore: number;
  guestScore: number;
  hostTiebreak: number | null;
  guestTiebreak: number | null;
  winner: 'host' | 'guest';
  duration: string; // Format: "H:MM"
}

export interface SwingVisionParsedData {
  settings: SwingVisionSettingsSheet;
  sets: SwingVisionSetData[];
  totalDuration: string; // Format: "H:MM"
}
