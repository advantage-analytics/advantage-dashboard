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
      const uint8Array = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(uint8Array, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
      });

      // SwingVision files must have Settings and Sets sheets
      return 'Settings' in workbook.Sheets && 'Sets' in workbook.Sheets;
    } catch {
      return false;
    }
  }

  async parse(file: File): Promise<ParseResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(uint8Array, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
      });

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

      const settings = this.parseSettingsSheet(settingsSheet, workbook);
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

  private parseSettingsSheet(sheet: XLSX.WorkSheet, workbook?: XLSX.WorkBook): SwingVisionSettingsSheet {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (rows.length < 2) {
      return {
        hostTeam: 'Player',
        guestTeam: 'Opponent',
        adScoring: false,
      };
    }

    // Try direct cell access first (more reliable than header matching)
    let hostTeam = 'Player';
    let guestTeam = '';
    let adScoring = false;

    // Row 2 (index 1) contains the data values
    const dataRow = rows[1] || [];

    // Try common column positions: Host Team typically at D, Guest Team at E
    // But use header matching to be flexible with column order
    const headers = (rows[0] || []).map((h) => String(h).toLowerCase().trim());
    const hostTeamIdx = headers.findIndex((h) => h.includes('host team'));
    const guestTeamIdx = headers.findIndex((h) => h.includes('guest team'));
    const adScoringIdx = headers.findIndex((h) => h.includes('ad scoring'));

    if (hostTeamIdx !== -1 && dataRow.length > hostTeamIdx) {
      hostTeam = String(dataRow[hostTeamIdx] || 'Player').trim();
    }

    if (guestTeamIdx !== -1 && dataRow.length > guestTeamIdx) {
      guestTeam = String(dataRow[guestTeamIdx] || '').trim();
    }

    if (adScoringIdx !== -1 && dataRow.length > adScoringIdx) {
      adScoring = this.parseBoolean(dataRow[adScoringIdx]);
    }

    let guestTeamFromFallback = false;

    // Validate guestTeam - must look like a name (contains at least one letter)
    if (guestTeam) {
      const hasLetters = /[a-zA-Z]/.test(guestTeam);
      if (!hasLetters) {
        guestTeam = ''; // Reject numeric-only values like "174"
      }
    }

    // If guest team is still empty, search for it in the metadata rows (SwingVision sometimes puts it elsewhere)
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

    // If guest team is still empty and we have a workbook, try to extract from Shots sheet
    if (!guestTeam && workbook && 'Shots' in workbook.Sheets) {
      const shotsSheet = workbook.Sheets['Shots'];
      const shotRows = XLSX.utils.sheet_to_json(shotsSheet, { header: 1, defval: '' }) as unknown[][];

      // Look for player name in column 22 (index 22) of the Shots sheet
      // Search through the first few rows to find a name that's different from hostTeam
      for (let i = 1; i < Math.min(10, shotRows.length); i++) {
        if (shotRows[i].length > 22) {
          const playerFromShots = String(shotRows[i][22] || '').trim();
          // Find the name that's NOT the host team
          if (playerFromShots && playerFromShots !== hostTeam && playerFromShots.length > 2) {
            guestTeam = playerFromShots;
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
      adScoring,
      startTime: dataRow[0] ? String(dataRow[0]) : undefined,
      endTime: dataRow[1] ? String(dataRow[1]) : undefined,
      location: headers.includes('location') ? String(dataRow[headers.indexOf('location')] || '') : undefined,
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

  private calculateTotalDuration(sets: SwingVisionSetData[]): number {
    // Sum all set durations (in milliseconds)
    let totalMs = 0;

    for (const set of sets) {
      totalMs += set.duration;
    }

    return totalMs;
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
    let result: string = '';

    if (settings.guestTeamFromFallback) {
      // Fallback case: Guest was empty, found in metadata
      // Only swap the names - scores/tiebreaks are already correct
      playerName = settings.guestTeam || 'Player';
      opponentName = settings.hostTeam || 'Opponent';
      // Keep scores/tiebreaks mapped to host/guest (don't swap)
      playerScores = sets.map((s) => s.hostScore);
      opponentScores = sets.map((s) => s.guestScore);
      playerTiebreaks = sets.map((s) => s.hostTiebreak);
      opponentTiebreaks = sets.map((s) => s.guestTiebreak);
      // Calculate result normally
      const hostWins = sets.filter((s) => s.winner === 'host').length;
      const guestWins = sets.filter((s) => s.winner === 'guest').length;
      if (hostWins > guestWins) {
        result = `${playerName} Wins`;
      } else if (guestWins > hostWins) {
        result = `${opponentName} Wins`;
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
        result = `${playerName} Wins`;
      } else if (guestWins > hostWins) {
        result = `${opponentName} Wins`;
      }
    }

    // Determine bestOf - only 1, 3, or 5 are valid
    let bestOfNum = 3; // Default
    if (sets.length === 1) {
      bestOfNum = 1;
    } else if (sets.length === 2) {
      bestOfNum = 3; // Convert 2-set matches to best of 3 (player must have won 2-0)
    } else if (sets.length >= 3) {
      bestOfNum = 3; // 3 or more sets is best of 3
    }

    return {
      playerName,
      opponentName,
      playerScores,
      opponentScores,
      playerTiebreaks,
      opponentTiebreaks,
      bestOf: String(bestOfNum),
      adScoring: settings.adScoring,
      result,
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

  private parseDuration(duration: unknown): number {
    // Return duration in milliseconds
    // Handle various formats: "H:MM" string, or seconds number (SwingVision export format)
    if (!duration) {
      return 0;
    }

    const trimmed = String(duration).trim();

    // If it contains a colon, it's in H:MM format - convert to milliseconds
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const totalSeconds = hours * 3600 + minutes * 60;
        return totalSeconds * 1000; // Convert to milliseconds
      }
    }

    // Parse as seconds (SwingVision export format) and convert to milliseconds
    const seconds = parseFloat(trimmed);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.floor(seconds * 1000); // Convert seconds to milliseconds
    }

    return 0;
  }
}
