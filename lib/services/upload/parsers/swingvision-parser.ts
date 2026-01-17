/**
 * SwingVision XLSX file parser
 * Parses SwingVision Excel files and extracts match data
 */

import * as XLSX from 'xlsx';
import {
  IFileParser,
  ParseResult,
  SwingVisionSettingsSheet,
  SwingVisionSetData,
  SwingVisionParsedData,
  FormData,
} from './types';

export class SwingVisionParser implements IFileParser {
  async canParse(file: File): Promise<boolean> {
    // Check if file is an Excel file and has SwingVision structure
    if (!file.name.endsWith('.xlsx')) {
      return false;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      // SwingVision files must have Settings and Sets sheets
      return 'Settings' in workbook.Sheets && 'Sets' in workbook.Sheets;
    } catch {
      return false;
    }
  }

  async parse(file: File): Promise<ParseResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);

      // Validate required sheets
      if (!('Settings' in workbook.Sheets) || !('Sets' in workbook.Sheets)) {
        return {
          success: false,
          error: 'Invalid SwingVision file: Missing required sheets (Settings or Sets)',
          warnings: [],
        };
      }

      // Parse both sheets
      const settingsSheet = workbook.Sheets['Settings'];
      const setsSheet = workbook.Sheets['Sets'];

      const settings = this.parseSettingsSheet(settingsSheet);
      const sets = this.parseSetsSheet(setsSheet);

      if (sets.length === 0) {
        return {
          success: false,
          error: 'No match data found in Sets sheet',
          warnings: [],
        };
      }

      // Calculate total duration
      const totalDuration = this.calculateTotalDuration(sets);

      // Transform to FormData
      const formData = this.transformToFormData({
        settings,
        sets,
        totalDuration,
      });

      return {
        success: true,
        data: formData,
        warnings: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to parse file: ${message}`,
        warnings: [],
      };
    }
  }

  private parseSettingsSheet(sheet: XLSX.WorkSheet): SwingVisionSettingsSheet {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (rows.length < 2) {
      return {
        hostTeam: 'Player',
        guestTeam: 'Opponent',
        adScoring: false,
      };
    }

    const headers = (rows[0] || []).map((h) => String(h).toLowerCase().trim());
    const values = rows[1] || [];

    const hostTeamIdx = headers.findIndex((h) => h.includes('host team'));
    const guestTeamIdx = headers.findIndex((h) => h.includes('guest team'));
    const adScoringIdx = headers.findIndex((h) => h.includes('ad scoring'));

    let hostTeam = hostTeamIdx !== -1 ? String(values[hostTeamIdx] || 'Player').trim() : 'Player';
    let guestTeam = guestTeamIdx !== -1 ? String(values[guestTeamIdx] || '').trim() : '';
    let guestTeamFromFallback = false;

    // If guest team is empty, search for it in the metadata rows (SwingVision sometimes puts it elsewhere)
    if (!guestTeam && rows.length > 6) {
      // Look in rows 5-10 for player names
      for (let i = 5; i < Math.min(10, rows.length); i++) {
        const row = rows[i] || [];
        if (row[0] && String(row[0]).trim() && String(row[0]).trim() !== hostTeam) {
          const candidate = String(row[0]).trim();
          if (candidate.length > 2 && !candidate.includes('Speed') && !candidate.includes('is positive')) {
            guestTeam = candidate;
            guestTeamFromFallback = true;
            break;
          }
        }
      }
    }

    if (!guestTeam) {
      guestTeam = 'Opponent';
    }

    return {
      hostTeam,
      guestTeam,
      guestTeamFromFallback,
      adScoring: this.parseBoolean(values[adScoringIdx]),
      startTime: values[0] ? String(values[0]) : undefined,
      endTime: values[1] ? String(values[1]) : undefined,
      location: headers.includes('location') ? String(values[headers.indexOf('location')] || '') : undefined,
    };
  }

  private parseSetsSheet(sheet: XLSX.WorkSheet): SwingVisionSetData[] {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (rows.length < 2) {
      return [];
    }

    const headers = (rows[0] || []).map((h) => String(h).toLowerCase().trim());

    // Find column indices
    const setIdx = headers.findIndex((h) => h.includes('set'));
    const hostScoreIdx = headers.findIndex((h) => h.includes('host score'));
    const guestScoreIdx = headers.findIndex((h) => h.includes('guest score'));
    const hostTiebrkIdx = headers.findIndex((h) => h.includes('host tiebreak'));
    const guestTiebrkIdx = headers.findIndex((h) => h.includes('guest tiebreak'));
    const winnerIdx = headers.findIndex((h) => h.includes('set winner'));
    const durationIdx = headers.findIndex((h) => h.includes('duration'));

    const sets: SwingVisionSetData[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row[setIdx]) break; // Stop at empty rows

      const hostScore = this.parseNumber(row[hostScoreIdx]);
      const guestScore = this.parseNumber(row[guestScoreIdx]);

      if (hostScore === null || guestScore === null) {
        continue; // Skip invalid rows
      }

      // Determine winner from scores (SwingVision sometimes has stats labels in winner column)
      const winner = hostScore > guestScore ? 'host' : 'guest';
      const duration = this.parseDuration(row[durationIdx]);

      sets.push({
        setNumber: i,
        hostScore,
        guestScore,
        hostTiebreak: this.parseNumber(row[hostTiebrkIdx]),
        guestTiebreak: this.parseNumber(row[guestTiebrkIdx]),
        winner,
        duration,
      });
    }

    return sets;
  }

  private calculateTotalDuration(sets: SwingVisionSetData[]): string {
    let totalMinutes = 0;
    let totalHours = 0;

    for (const set of sets) {
      const [hours, minutes] = set.duration.split(':').map(Number);
      totalMinutes += minutes || 0;
      totalHours += hours || 0;
    }

    // Handle minute overflow
    totalHours += Math.floor(totalMinutes / 60);
    totalMinutes = totalMinutes % 60;

    return `${totalHours}:${String(totalMinutes).padStart(2, '0')}`;
  }


  private transformToFormData(
    parsed: SwingVisionParsedData
  ): Partial<FormData> {
    const { settings, sets, totalDuration } = parsed;

    // Determine player and opponent names
    // When fallback was used (guestTeam from metadata), SwingVision puts opponent in hostTeam
    let playerName: string;
    let opponentName: string;
    let playerScores: number[];
    let opponentScores: number[];
    let playerTiebreaks: (number | null)[];
    let opponentTiebreaks: (number | null)[];
    let result: 'Player Wins' | 'Opponent Wins' | null = null;

    if (settings.guestTeamFromFallback) {
      // Fallback case: Guest was empty, found in metadata
      // In this case, SwingVision puts the OPPONENT in hostTeam
      // and the actual PLAYER is in guestTeam (from fallback)
      playerName = settings.guestTeam || 'Player';
      opponentName = settings.hostTeam || 'Opponent';
      // Swap scores and tiebreaks since we're swapping player/opponent
      playerScores = sets.map((s) => s.guestScore);
      opponentScores = sets.map((s) => s.hostScore);
      playerTiebreaks = sets.map((s) => s.guestTiebreak);
      opponentTiebreaks = sets.map((s) => s.hostTiebreak);
      // Calculate result based on swapped scores
      const playerWins = sets.filter((s) => s.winner === 'guest').length;
      const opponentWins = sets.filter((s) => s.winner === 'host').length;
      if (playerWins > opponentWins) {
        result = 'Player Wins';
      } else if (opponentWins > playerWins) {
        result = 'Opponent Wins';
      }
    } else {
      // Normal case: Both teams populated from Settings sheet
      playerName = settings.hostTeam || 'Player';
      opponentName = settings.guestTeam || 'Opponent';
      playerScores = sets.map((s) => s.hostScore);
      opponentScores = sets.map((s) => s.guestScore);
      playerTiebreaks = sets.map((s) => s.hostTiebreak);
      opponentTiebreaks = sets.map((s) => s.guestTiebreak);
      // Calculate result normally
      const hostWins = sets.filter((s) => s.winner === 'host').length;
      const guestWins = sets.filter((s) => s.winner === 'guest').length;
      if (hostWins > guestWins) {
        result = 'Player Wins';
      } else if (guestWins > hostWins) {
        result = 'Opponent Wins';
      }
    }

    // Determine bestOf
    const bestOfNum = sets.length > 0 ? (sets.length === 1 ? 1 : sets.length < 3 ? 2 : 3) : 3;

    return {
      playerName,
      opponentName,
      playerScores,
      opponentScores,
      playerTiebreaks,
      opponentTiebreaks,
      bestOf: String(bestOfNum),
      adScoring: settings.adScoring,
      result: result || '',
      duration: totalDuration,
    };
  }

  private parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  private parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const str = String(value).toLowerCase().trim();
    return str === 'true' || str === 'yes' || str === '1';
  }

  private parseDuration(duration: unknown): string {
    // Handle various formats: "H:MM" string, milliseconds number, or undefined
    if (!duration) {
      return '0:00';
    }

    const trimmed = String(duration).trim();

    // If it contains a colon, it's already in H:MM format
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        return `${hours}:${String(minutes).padStart(2, '0')}`;
      }
    }

    // Try to parse as milliseconds (SwingVision export format)
    const ms = parseFloat(trimmed);
    if (!isNaN(ms) && ms > 0) {
      const totalSeconds = Math.floor(ms);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }

    return '0:00';
  }
}
