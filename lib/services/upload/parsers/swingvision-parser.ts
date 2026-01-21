/**
 * SwingVision XLSX file parser
 * Parses SwingVision Excel files and extracts match data
 * 
 * NOTE: This parser uses exceljs which requires Node.js environment.
 * It should only be used in client-side code or API routes.
 */

// Dynamic import to prevent SSR bundling issues
// This function loads exceljs only when needed at runtime
async function getExcelJS() {
  // Dynamic import that Next.js won't try to bundle for SSR
  const exceljs = await import('exceljs');
  return exceljs;
}
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
      const exceljs = await getExcelJS();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // SwingVision files must have Settings and Sets sheets
      const settingsSheet = workbook.getWorksheet('Settings');
      const setsSheet = workbook.getWorksheet('Sets');
      return settingsSheet !== undefined && setsSheet !== undefined;
    } catch {
      return false;
    }
  }

  async parse(file: File): Promise<ParseResult> {
    try {
      const exceljs = await getExcelJS();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Validate required sheets
      const settingsSheet = workbook.getWorksheet('Settings');
      const setsSheet = workbook.getWorksheet('Sets');

      if (!settingsSheet || !setsSheet) {
        return {
          success: false,
          error: 'Invalid SwingVision file: Missing required sheets (Settings or Sets)',
          warnings: [],
        };
      }

      const settings = await this.parseSettingsSheet(settingsSheet, workbook);
      const sets = await this.parseSetsSheet(setsSheet);

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

  private async parseSettingsSheet(sheet: any, workbook?: any): Promise<SwingVisionSettingsSheet> {
    // Convert worksheet to rows array
    const rows: unknown[][] = [];
    sheet.eachRow((row) => {
      const values = row.values as unknown[] | undefined;
      rows.push((values || []).slice(1)); // slice(1) removes Excel's 1-indexed placeholder
    });

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
    if (!guestTeam && workbook) {
      const shotsSheet = workbook.getWorksheet('Shots');
      if (shotsSheet) {
        const shotRows: unknown[][] = [];
        shotsSheet.eachRow((row) => {
          const values = row.values as unknown[] | undefined;
          shotRows.push((values || []).slice(1));
        });

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

  private async parseSetsSheet(sheet: any): Promise<SwingVisionSetData[]> {
    // Convert worksheet to rows array
    const rows: unknown[][] = [];
    sheet.eachRow((row) => {
      const values = row.values as unknown[] | undefined;
      rows.push((values || []).slice(1)); // slice(1) removes Excel's 1-indexed placeholder
    });

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

      // Read winner from the Set Winner column if available, otherwise calculate from scores
      let winner: 'host' | 'guest' | 'draw';
      if (winnerIdx !== -1 && row[winnerIdx]) {
        const winnerValue = String(row[winnerIdx]).toLowerCase().trim();
        if (winnerValue === 'draw') {
          winner = 'draw';
        } else if (winnerValue === 'guest') {
          winner = 'guest';
        } else if (winnerValue === 'host') {
          winner = 'host';
        } else {
          // Column has stats data, calculate from scores
          winner = hostScore > guestScore ? 'host' : (guestScore > hostScore ? 'guest' : 'draw');
        }
      } else {
        // No winner column, calculate from scores
        winner = hostScore > guestScore ? 'host' : (guestScore > hostScore ? 'guest' : 'draw');
      }
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
      const draws = sets.filter((s) => s.winner === 'draw').length;

      if (draws > 0) {
        // If any set is a draw, match is incomplete
        result = 'Unfinished';
      } else if (hostWins > guestWins) {
        result = `${playerName} Wins`;
      } else if (guestWins > hostWins) {
        result = `${opponentName} Wins`;
      } else if (hostWins === guestWins && hostWins > 0) {
        // Tied sets (both won same number of sets)
        result = 'Unfinished';
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
      const draws = sets.filter((s) => s.winner === 'draw').length;

      if (draws > 0) {
        // If any set is a draw, match is incomplete
        result = 'Unfinished';
      } else if (hostWins > guestWins) {
        result = `${playerName} Wins`;
      } else if (guestWins > hostWins) {
        result = `${opponentName} Wins`;
      } else if (hostWins === guestWins && hostWins > 0) {
        // Tied sets (both won same number of sets)
        result = 'Unfinished';
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
