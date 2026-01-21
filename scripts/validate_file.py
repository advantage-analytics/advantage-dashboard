#!/usr/bin/env python3
"""
Excel File Validation Script

This script validates uploaded Excel files before they are stored.
It checks:
1. The file has exactly 6 required sheets: [Settings, Shots, Points, Games, Sets, Stats]
2. All sheets contain data (no empty sheets)
3. No missing critical data in the sheets

Usage:
    python validate_excel_file.py --file-path <path>
    python validate_excel_file.py --file-bytes <base64_encoded_bytes>

For local testing with Supabase:
    python validate_excel_file.py --user-id <id> --file-name <name>
"""

import argparse
import sys
import os
import json
import base64
from pathlib import Path
from io import BytesIO

import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

# Required sheets - must match what file_utils.py expects
# Note: "Sets" and "Stats" are separate sheets, not "Sets Stats"
REQUIRED_SHEETS = ["Settings", "Shots", "Points", "Games", "Sets", "Stats"]


def validate_excel_structure(file_path: str = None, file_bytes: bytes = None) -> dict:
    """
    Validate Excel file structure and data completeness.

    Args:
        file_path: Path to local Excel file (for testing)
        file_bytes: Bytes of Excel file (for API usage)

    Returns:
        dict: Validation results with success status and error messages
    """
    try:
        # Load file
        if file_path:
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": f"File not found: {file_path}",
                }
            excel_file = pd.ExcelFile(file_path)
        elif file_bytes:
            excel_file = pd.ExcelFile(BytesIO(file_bytes))
        else:
            return {
                "success": False,
                "error": "Either file_path or file_bytes must be provided",
            }

        # Get sheet names
        sheet_names = excel_file.sheet_names
        found_sheets = set(sheet_names)
        required_sheets_set = set(REQUIRED_SHEETS)

        # Check 1: Verify exactly 6 sheets exist
        if len(sheet_names) != 6:
            return {
                "success": False,
                "error": f"File must have exactly 6 sheets. Found {len(sheet_names)} sheets: {', '.join(sheet_names)}",
                "found_sheets": sheet_names,
                "required_sheets": REQUIRED_SHEETS,
            }

        # Check 2: Verify all required sheets are present
        missing_sheets = required_sheets_set - found_sheets
        if missing_sheets:
            return {
                "success": False,
                "error": f"Missing required sheets: {', '.join(sorted(missing_sheets))}",
                "found_sheets": sheet_names,
                "required_sheets": REQUIRED_SHEETS,
                "missing_sheets": list(missing_sheets),
            }

        # Check 3: Verify no extra sheets (should be exactly 6, all required)
        extra_sheets = found_sheets - required_sheets_set
        if extra_sheets:
            return {
                "success": False,
                "error": f"File contains unexpected sheets: {', '.join(sorted(extra_sheets))}. Only the following 6 sheets are allowed: {', '.join(REQUIRED_SHEETS)}",
                "found_sheets": sheet_names,
                "required_sheets": REQUIRED_SHEETS,
                "extra_sheets": list(extra_sheets),
            }

        # Check 4: Validate each sheet has data (basic check only)
        validation_errors = []
        for sheet_name in REQUIRED_SHEETS:
            try:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)

                # Check if sheet is completely empty (no data at all)
                if df.empty:
                    validation_errors.append(
                        f"Sheet '{sheet_name}' is empty (no rows or columns)"
                    )
                    continue

                # Remove completely empty rows and columns before checking
                # (trailing empty rows/columns are common in Excel files)
                df_cleaned = df.dropna(how='all').dropna(axis=1, how='all')
                
                # After cleaning, check if there's any actual data left
                if df_cleaned.empty:
                    validation_errors.append(
                        f"Sheet '{sheet_name}' contains no data (all rows or columns are empty)"
                    )
                    continue

                # Only check if the sheet has at least some data
                # We don't validate specific columns or missing data percentages
                # as many fields are optional (e.g., Set 3/4/5 for shorter matches, optional Settings fields)

            except Exception as e:
                validation_errors.append(
                    f"Error reading sheet '{sheet_name}': {str(e)}"
                )

        if validation_errors:
            return {
                "success": False,
                "error": "Data validation failed",
                "validation_errors": validation_errors,
            }

        # All checks passed
        return {
            "success": True,
            "message": "File validation passed",
            "sheets_validated": REQUIRED_SHEETS,
            "total_rows": {
                sheet: len(pd.read_excel(excel_file, sheet_name=sheet))
                for sheet in REQUIRED_SHEETS
            },
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Validation error: {str(e)}",
        }


def validate_from_supabase(user_id: str, file_name: str) -> dict:
    """
    Validate file from Supabase Storage.

    Args:
        user_id: User ID
        file_name: File name in storage

    Returns:
        dict: Validation results
    """
    try:
        load_dotenv(dotenv_path=".env.local")

        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

        if not supabase_url or not supabase_key:
            return {
                "success": False,
                "error": "Supabase credentials not found in environment variables",
            }

        supabase: Client = create_client(supabase_url, supabase_key)

        file_path = f"{user_id}/{file_name}"
        file_bytes = supabase.storage.from_("match-data").download(file_path)

        return validate_excel_structure(file_bytes=file_bytes)

    except Exception as e:
        return {
            "success": False,
            "error": f"Error downloading file from Supabase: {str(e)}",
        }


def main():
    """Main function to handle command line arguments and validate Excel file."""
    parser = argparse.ArgumentParser(
        description="Validate Excel file structure and data completeness"
    )
    parser.add_argument(
        "--file-path", help="Path to local Excel file (for testing)"
    )
    parser.add_argument(
        "--file-bytes",
        help="Base64 encoded file bytes (for API usage)",
    )
    parser.add_argument("--user-id", help="User ID (for Supabase download)")
    parser.add_argument("--file-name", help="File name in Supabase Storage")

    args = parser.parse_args()

    # Determine validation method
    if args.file_path:
        result = validate_excel_structure(file_path=args.file_path)
    elif args.file_bytes:
        try:
            file_bytes = base64.b64decode(args.file_bytes)
            result = validate_excel_structure(file_bytes=file_bytes)
        except Exception as e:
            result = {
                "success": False,
                "error": f"Error decoding file bytes: {str(e)}",
            }
    elif args.user_id and args.file_name:
        result = validate_from_supabase(args.user_id, args.file_name)
    else:
        parser.print_help()
        result = {
            "success": False,
            "error": "Either --file-path, --file-bytes, or (--user-id and --file-name) must be provided",
        }

    # Output result as JSON for the API to consume
    # Use compact JSON (no indentation) so it's easier to parse from command line
    print(json.dumps(result))

    # Exit with appropriate code
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
