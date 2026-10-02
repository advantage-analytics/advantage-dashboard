#!/usr/bin/env python3
"""
Advantage Intelligence results JSON -> CSV, for analysis in pandas/numpy.

The vendor ships a flat JSON array of stroke objects. That is already
rectangular, so the conversion itself is trivial; the part worth having a
script for is the sentinels.

Three sentinel forms are documented (docs/splitstep-integration-spec.md §4.1)
and a fourth is not:

    -9999.0   float fields   (bounce_x_m, height_at_net_m, bounce_score, ...)
    -9999     integer fields (bounce_frame)
    "None"    string fields  (every ground-truth column, in 100% of rows)
    "nan-nan" score strings  (pred_set_score) -- undocumented

They are emptied here, at the boundary, for the same reason
src/lib/services/splitstep/derivation/parse.ts empties them at its boundary:
the failure is invisible. A single -9999 surviving into df["speed_kmh"].mean()
drags the average down by tens of km/h without raising, without looking wrong,
and without appearing anywhere in the output.

This script deliberately does NOT null physically-impossible-but-finite
coordinates the way parse.ts does (bounce_y_m up to 371.7 on a court whose
fence is at 18.3). Production nulls them because they must never reach a
placement chart. Analysis wants to see them, because how many there are IS the
question. Compute the plausibility mask in the notebook instead.

Usage:
    python3 scripts/splitstep_json_to_csv.py tests/fixtures/splitstep/*.json -o analysis/data
    python3 scripts/splitstep_json_to_csv.py results.json -o out --raw
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path

# Matches parse.ts: the sentinel appears as both -9999 and -9999.0, and float
# round-tripping through JSON has been observed to shift it, so compare with a
# tolerance rather than for equality.
NUMERIC_SENTINEL = -9999
NUMERIC_TOLERANCE = 1

STRING_SENTINEL = "None"

# The "nan-nan" rule is confined to score strings on purpose. Applied broadly it
# would also match pred_player_id, and the bare token "Nan" is a real given
# name -- a player called Nan would have every stroke silently dropped.
SCORE_COLUMNS = frozenset(
    {
        "point_score",
        "game_score",
        "set_score",
        "pred_point_score",
        "pred_game_score",
        "pred_set_score",
    }
)
NAN_SCORE = re.compile(r"^nan([.-]|$)", re.IGNORECASE)


def clean(column: str, value: object) -> object:
    """One cell, with sentinels replaced by None (an empty CSV field)."""
    if value is None:
        return None

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            return None
        if abs(value - NUMERIC_SENTINEL) < NUMERIC_TOLERANCE:
            return None
        return value

    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed or trimmed == STRING_SENTINEL:
            return None
        if column in SCORE_COLUMNS and NAN_SCORE.match(trimmed):
            return None
        return trimmed

    # Nested objects/arrays would break the flat-CSV assumption. Nothing in the
    # observed schema is nested, so surface it loudly rather than silently
    # stringifying a structure someone will later parse by hand.
    raise TypeError(f"column {column!r} holds a non-scalar {type(value).__name__}")


def columns_of(rows: list[dict]) -> list[str]:
    """Union of every key, in first-seen order, so schema drift never drops one."""
    ordered: dict[str, None] = {}
    for row in rows:
        for key in row:
            ordered.setdefault(key, None)
    return list(ordered)


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError(f"{path}: expected a JSON array of stroke objects")
    if not all(isinstance(row, dict) for row in payload):
        raise ValueError(f"{path}: every element must be a stroke object")
    return payload


def write_csv(rows: list[dict], columns: list[str], out: Path, raw: bool) -> dict[str, int]:
    """Write the CSV; return per-column counts of cells emptied as sentinels."""
    emptied = {column: 0 for column in columns}

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for row in rows:
            record = []
            for column in columns:
                value = row.get(column)
                if raw:
                    record.append("" if value is None else value)
                    continue
                cleaned = clean(column, value)
                if cleaned is None and value is not None:
                    emptied[column] += 1
                record.append("" if cleaned is None else cleaned)
            writer.writerow(record)

    return emptied


def report(name: str, total: int, emptied: dict[str, int]) -> None:
    hits = {col: n for col, n in emptied.items() if n}
    print(f"  {total} rows, {len(emptied)} columns -> {name}")
    if not hits:
        print("  no sentinels found")
        return
    print(f"  sentinels emptied in {len(hits)} column(s):")
    width = max(len(col) for col in hits)
    for col, n in sorted(hits.items(), key=lambda item: (-item[1], item[0])):
        print(f"    {col:<{width}}  {n:>6}  ({n / total:6.1%})")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert Advantage Intelligence results JSON to CSV for pandas."
    )
    parser.add_argument("inputs", nargs="+", type=Path, help="results JSON file(s)")
    parser.add_argument(
        "-o", "--out-dir", type=Path, default=Path("analysis/data"),
        help="output directory (default: analysis/data)",
    )
    parser.add_argument(
        "--raw", action="store_true",
        help="write values verbatim, leaving -9999 and \"None\" in place",
    )
    parser.add_argument(
        "--no-combined", action="store_true",
        help="skip the stacked all-matches CSV written when there are 2+ inputs",
    )
    args = parser.parse_args()

    if args.raw:
        print("--raw: sentinels preserved. -9999 will corrupt any mean() you take.\n")

    loaded: list[tuple[Path, list[dict]]] = []
    for path in args.inputs:
        try:
            loaded.append((path, load(path)))
        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f"error: {error}", file=sys.stderr)
            return 1

    for path, rows in loaded:
        if not rows:
            print(f"{path}: empty, skipped", file=sys.stderr)
            continue
        columns = columns_of(rows)
        out = args.out_dir / f"{path.stem}.csv"
        print(f"{path}")
        report(out.name, len(rows), write_csv(rows, columns, out, args.raw))
        print()

    stacked = [row for _, rows in loaded for row in rows]
    if len(loaded) > 1 and stacked and not args.no_combined:
        columns = columns_of(stacked)
        out = args.out_dir / "all-matches.csv"
        print(f"combined ({len(loaded)} files)")
        report(out.name, len(stacked), write_csv(stacked, columns, out, args.raw))
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
