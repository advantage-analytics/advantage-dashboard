import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Nothing reads a match's date as a moment.
 *
 * `matches.date` stores a calendar day in its UTC date part; `match-day.ts`
 * is the one reading of it and `tests/match-day.spec.ts` proves that reading
 * is the same in every zone. This spec keeps the readers ON it: it fails when
 * code under the dashboard, its data layer or the public share page goes back
 * to one of the two shapes the bug was made of —
 *
 *   new Date(match.date)              a day read as an instant
 *   shortDate(row.date)               the moment formatters, handed a day
 *   formatShortDate(match.date)
 *
 * It is a text check, so it is deliberately narrow: only a `.date` member
 * passed straight in, only in the trees where `.date` means a match's date
 * (plus the one admin card that prints one). Comments are ignored. A real
 * moment kept in a field called `date` would trip it — name the field for
 * what it is (`createdAt`, `updatedAt`) rather than adding it to `ALLOWED`.
 */

const ROOT = path.resolve(__dirname, "..");

const SCANNED = [
  "src/lib/data",
  "src/components/dashboard",
  "src/app/dashboard",
  "src/app/m",
  "src/components/admin/admin-roster-card.tsx",
];

/**
 * Deliberate exceptions, each a line that must still exist — a stale entry
 * fails the spec, so this list cannot outlive the code it excuses.
 */
const ALLOWED: { file: string; line: RegExp; why: string }[] = [
  {
    file: "src/lib/data/performance-server.ts",
    line: /new Date\((?:match|m)\.date\) (?:<|>=) cutoff/,
    why: 'the "last N days" win-rate windows compare instants against now − N days; parsing the stored ISO string is zone-independent, and a day rule would change which matches each KPI counts',
  },
];

const AS_INSTANT =
  /new Date\(\s*[A-Za-z_$][\w$]*(?:\??\.[\w$]+|!|\[[^\]]*\])*\??\.date\s*!?\s*\)/;
const AS_MOMENT_LABEL =
  /\b(?:shortDate|formatShortDate)\(\s*[A-Za-z_$][\w$]*(?:\??\.[\w$]+|!|\[[^\]]*\])*\??\.date\b/;

function sourceFiles(entry: string): string[] {
  const absolute = path.join(ROOT, entry);
  if (statSync(absolute).isFile()) return [entry];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((child) => {
    const relative = path.join(entry, child.name);
    if (child.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(child.name) ? [relative] : [];
  });
}

/** Source with comments blanked, line numbers kept. */
function codeLines(file: string): string[] {
  return readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""));
}

test("no match-date reader treats the day as a moment", () => {
  const files = SCANNED.flatMap(sourceFiles);
  // The scan really covers the tree — a moved directory must not pass it empty.
  expect(files.length).toBeGreaterThan(300);
  expect(files).toContain("src/lib/data/matches-list-types.ts");

  const used = new Set<number>();
  const offenders: string[] = [];
  for (const file of files) {
    codeLines(file).forEach((line, index) => {
      if (!AS_INSTANT.test(line) && !AS_MOMENT_LABEL.test(line)) return;
      const allowed = ALLOWED.findIndex(
        (entry) => entry.file === file && entry.line.test(line),
      );
      if (allowed >= 0) {
        used.add(allowed);
        return;
      }
      offenders.push(`${file}:${index + 1}  ${line.trim()}`);
    });
  }

  expect(
    offenders,
    "A match's date is a calendar day — read it with matchDay() / formatMatchDay*() from src/lib/data/match-day.ts:\n" +
      offenders.join("\n"),
  ).toEqual([]);

  const stale = ALLOWED.filter((_, index) => !used.has(index)).map(
    (entry) => `${entry.file}: ${entry.line}`,
  );
  expect(stale, "ALLOWED entries that excuse nothing any more").toEqual([]);
});

test("the check sees the shapes it is for, and not their neighbours", () => {
  for (const bad of [
    "const d = new Date(match.date);",
    "new Date(row.date).getFullYear()",
    "new Date(r.match.date)",
    "new Date(first?.date)",
    "new Date(rows[0]!.date)",
  ]) {
    expect(AS_INSTANT.test(bad), bad).toBe(true);
  }
  for (const bad of [
    "date: shortDate(row.date),",
    "{formatShortDate(match.date)}",
    'latest.match.date ? shortDate(latest.match.date) : ""',
  ]) {
    expect(AS_MOMENT_LABEL.test(bad), bad).toBe(true);
  }
  for (const fine of [
    "new Date(row.updated_at)",
    "new Date(updatedAt).getFullYear()",
    "new Date(Date.UTC(year, month, 1))",
    "shortDate(row.created_at)",
    "formatShortDate(draft.updatedAt)",
    "formatMatchDayShort(row.date)",
    "matchDay(match.date)",
  ]) {
    expect(AS_INSTANT.test(fine) || AS_MOMENT_LABEL.test(fine), fine).toBe(
      false,
    );
  }
});
