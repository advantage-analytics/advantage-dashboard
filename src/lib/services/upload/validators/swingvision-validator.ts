/**
 * SwingVision Excel File Validator
 *
 * Validates SwingVision Excel files before processing.
 * Checks:
 * 1. File has exactly 6 required sheets
 * 2. No missing or extra sheets
 * 3. All sheets contain data (not empty)
 */

// Dynamic import to prevent SSR bundling issues
async function getExcelJS() {
  const exceljs = await import('exceljs');
  return exceljs;
}

export interface ValidationResult {
  success: boolean;
  error?: string;
  validation_errors?: string[];
  found_sheets?: string[];
  required_sheets?: string[];
  missing_sheets?: string[];
  extra_sheets?: string[];
  message?: string;
  sheets_validated?: string[];
  total_rows?: Record<string, number>;
}

const REQUIRED_SHEETS = ['Settings', 'Shots', 'Points', 'Games', 'Sets', 'Stats'];

/**
 * Validate a SwingVision Excel file structure and data
 * @param file - The Excel file to validate
 * @returns Validation result with success status and any errors
 */
export async function validateSwingVisionFile(file: File): Promise<ValidationResult> {
  try {
    // Load Excel file
    const exceljs = await getExcelJS();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Get sheet names
    const foundSheets = workbook.worksheets.map(ws => ws.name);
    const foundSheetsSet = new Set(foundSheets);
    const requiredSheetsSet = new Set(REQUIRED_SHEETS);

    // Check 1: Verify exactly 6 sheets exist
    if (foundSheets.length !== 6) {
      return {
        success: false,
        error: `File must have exactly 6 sheets. Found ${foundSheets.length} sheets: ${foundSheets.join(', ')}`,
        found_sheets: foundSheets,
        required_sheets: REQUIRED_SHEETS,
      };
    }

    // Check 2: Verify all required sheets are present
    const missingSheets = Array.from(requiredSheetsSet).filter(sheet => !foundSheetsSet.has(sheet));
    if (missingSheets.length > 0) {
      return {
        success: false,
        error: `Missing required sheets: ${missingSheets.join(', ')}`,
        found_sheets: foundSheets,
        required_sheets: REQUIRED_SHEETS,
        missing_sheets: missingSheets,
      };
    }

    // Check 3: Verify no extra sheets (should be exactly the 6 required ones)
    const extraSheets = foundSheets.filter(sheet => !requiredSheetsSet.has(sheet));
    if (extraSheets.length > 0) {
      return {
        success: false,
        error: `File contains unexpected sheets: ${extraSheets.join(', ')}. Only the following 6 sheets are allowed: ${REQUIRED_SHEETS.join(', ')}`,
        found_sheets: foundSheets,
        required_sheets: REQUIRED_SHEETS,
        extra_sheets: extraSheets,
      };
    }

    // Check 4: Validate each sheet has data
    const validationErrors: string[] = [];
    const totalRows: Record<string, number> = {};

    // These sheets require actual data rows (not just headers)
    const sheetsRequiringData = ['Points', 'Games'];
    const minDataRowsRequired = 1; // At least 1 data row beyond header

    for (const sheetName of REQUIRED_SHEETS) {
      try {
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
          validationErrors.push(`Sheet '${sheetName}' not found`);
          continue;
        }

        // Collect all rows
        const rows: any[][] = [];
        worksheet.eachRow((row: any) => {
          const values = row.values as unknown[] | undefined;
          if (values && values.length > 1) {
            // Skip the first element (Excel's 1-based index placeholder)
            const rowData = values.slice(1);
            rows.push(rowData);
          }
        });

        // If no rows at all, sheet is empty
        if (rows.length === 0) {
          validationErrors.push(`Sheet '${sheetName}' is empty (no rows or columns)`);
          continue;
        }

        // Remove completely empty rows (all cells null/undefined/empty string)
        const nonEmptyRows = rows.filter(row =>
          row.some(cell => cell !== null && cell !== undefined && cell !== '')
        );

        // If no non-empty rows after cleaning, sheet has no actual data
        if (nonEmptyRows.length === 0) {
          validationErrors.push(`Sheet '${sheetName}' contains no data (all rows or columns are empty)`);
          continue;
        }

        // For Points and Games sheets, require minimum number of data rows
        // Row 1 is typically the header, so we need at least 2 rows total (header + 1 data row)
        if (sheetsRequiringData.includes(sheetName)) {
          // Count rows that are not headers (assume row 1 is header)
          const dataRows = nonEmptyRows.slice(1); // Skip header row
          if (dataRows.length < minDataRowsRequired) {
            validationErrors.push(`Sheet '${sheetName}' is empty`);
            continue;
          }
          totalRows[sheetName] = dataRows.length;
        } else {
          // For other sheets, just verify they have data
          totalRows[sheetName] = nonEmptyRows.length;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        validationErrors.push(`Error reading sheet '${sheetName}': ${message}`);
      }
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Data validation failed',
        validation_errors: validationErrors,
      };
    }

    // All checks passed
    return {
      success: true,
      message: 'File validation passed',
      sheets_validated: REQUIRED_SHEETS,
      total_rows: totalRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Validation error: ${message}`,
    };
  }
}
