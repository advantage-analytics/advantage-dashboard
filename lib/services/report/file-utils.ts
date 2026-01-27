import * as ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Target sheet names we expect in SwingVision-style exports.
 * Mirrors the Python `target_sheets` list.
 */
const TARGET_SHEETS = [
  "Shots",
  "Points",
  "Games",
  "Sets",
  "Stats",
  "Settings",
] as const;

export type TargetSheetName = (typeof TARGET_SHEETS)[number];

/**
 * Shape of a combined sheet row. We keep this loose for now because
 * different sheets have different columns. The only guaranteed field
 * we add is `__source_file__`.
 */
export type CombinedRow = Record<string, unknown> & {
  __source_file__: string;
};

/**
 * Result of `createCombinedSheets` – a map of sheet name to an array of
 * row objects. Only sheets that had at least one non-empty row are included.
 */
export type CombinedSheets = Partial<Record<TargetSheetName, CombinedRow[]>>;

export interface CreateCombinedOptions {
  supabase: SupabaseClient;
  userId: string;
  fileNames: string[];
  /**
   * Storage bucket that contains match data.
   * Defaults to `"match-data"` to mirror the existing Python scripts.
   */
  bucketId?: string;
}

/**
 * Download and combine multiple Excel files from Supabase Storage.
 *
 * This is a TypeScript port of `scripts/file_utils.py:create_combined`.
 * It:
 * - Downloads each `.xlsx` file (excluding `combined.xlsx`)
 * - Reads the target sheets
 * - Converts each sheet to an array of row objects
 * - Appends a `__source_file__` field to each row
 * - Concatenates rows for each sheet across all files
 */
export async function createCombinedSheets({
  supabase,
  userId,
  fileNames,
  bucketId = "match-data",
}: CreateCombinedOptions): Promise<CombinedSheets> {
  const combined: Record<TargetSheetName, CombinedRow[]> = {
    Shots: [],
    Points: [],
    Games: [],
    Sets: [],
    Stats: [],
    Settings: [],
  };

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".xlsx") || fileName === "combined.xlsx") {
      continue;
    }

    // If fileName is already a full storage path (contains '/'), use it directly.
    // Otherwise, construct it as {userId}/{fileName} for backward compatibility.
    const filePath = fileName.includes("/") ? fileName : `${userId}/${fileName}`;
    
    // Extract just the filename for __source_file__ field (last part after '/')
    const sourceFileName = fileName.includes("/") 
      ? fileName.split("/").pop() || fileName 
      : fileName;

    try {
      // eslint-disable-next-line no-console
      console.log(`📥 Downloading file from storage: ${filePath}`);
      
      const { data, error } = await supabase.storage
        .from(bucketId)
        .download(filePath);

      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error(`❌ Error downloading ${filePath}:`, error);
        continue;
      }
      
      // eslint-disable-next-line no-console
      console.log(`✅ Successfully downloaded ${filePath}`);

      const arrayBuffer = await data.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      for (const sheetName of TARGET_SHEETS) {
        const sheet = workbook.getWorksheet(sheetName);
        if (!sheet) {
          // eslint-disable-next-line no-console
          console.log(`  ⚠️ Sheet "${sheetName}" not found in ${sourceFileName}`);
          continue;
        }

        const rows = extractRowsFromSheet(sheet, sourceFileName);
        // eslint-disable-next-line no-console
        console.log(`  📊 Sheet "${sheetName}": ${rows.length} rows extracted`);
        if (rows.length > 0) {
          combined[sheetName].push(...rows);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`⚠️ Error with ${filePath}:`, err);
      continue;
    }
  }

  // Only include sheets that had data, just like the Python version.
  const result: CombinedSheets = {};
  for (const sheetName of TARGET_SHEETS) {
    const rows = combined[sheetName];
    if (rows.length > 0) {
      result[sheetName] = rows;
      // eslint-disable-next-line no-console
      console.log(`📋 Combined "${sheetName}": ${rows.length} total rows`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Combined sheets result:`, Object.keys(result));

  return result;
}

/**
 * Convert an ExcelJS worksheet into an array of plain objects.
 *
 * - Uses the first row as headers
 * - Maps each subsequent row's cell values into a `{ [header]: value }` object
 * - Skips completely empty rows
 * - Appends `__source_file__` to every row
 */
function extractRowsFromSheet(
  sheet: ExcelJS.Worksheet,
  sourceFileName: string,
): CombinedRow[] {
  const rows: CombinedRow[] = [];

  const headerRow = sheet.getRow(1);
  const headerValues = headerRow.values as (string | number | null | undefined)[];

  // Build a list of header names keyed by column index (1-based in ExcelJS)
  const headers: Record<number, string> = {};
  headerValues.forEach((header, idx) => {
    if (!header || idx === 0) return;
    headers[idx] = String(header);
  });

  sheet.eachRow((row, rowNumber) => {
    // Skip header row
    if (rowNumber === 1) return;

    const values = row.values as unknown[];
    const obj: Record<string, unknown> = {};

    let hasValue = false;
    Object.entries(headers).forEach(([colIndexStr, headerName]) => {
      const colIndex = Number(colIndexStr);
      const cellValue = values[colIndex];
      if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
        obj[headerName] = cellValue;
        hasValue = true;
      }
    });

    if (hasValue) {
      (obj as CombinedRow).__source_file__ = sourceFileName;
      rows.push(obj as CombinedRow);
    }
  });

  return rows;
}

