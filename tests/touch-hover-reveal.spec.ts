import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Nothing in the dashboard hides behind hover on an iPad.
 *
 * A finger has no hover, and Tailwind v4 only applies `hover:`/`group-hover:`
 * where the device can hover — so a control drawn `opacity-0` and revealed by
 * `group-hover:opacity-100` is invisible on an iPad while still sitting there
 * to be tapped by accident. The rule ("Touch (iPad)" in
 * `.skills/advantage-analytics-design/reference/chrome.md`) is that every such
 * reveal also says what touch does: `touch:opacity-100`, or a tapped state
 * (`group-data-[ask-tapped]`) for a readout that a tap opens.
 *
 * The same spec keeps `100vh` out: Safari's `100vh` is its height with the
 * toolbar hidden, so a `100vh` page runs under the toolbar. Use `dvh`.
 *
 * Text checks, one class string per line as the code is formatted. Comments
 * are ignored.
 */

const ROOT = path.resolve(__dirname, "..");

const SCANNED = [
  "src/components/dashboard",
  "src/components/ui",
  "src/app/dashboard",
];

const HOVER_REVEAL =
  /opacity-0\b[^"'`]*group-hover[^\s"'`]*:opacity-100|group-hover[^\s"'`]*:opacity-100[^"'`]*\bopacity-0\b/;

/** What a reveal may carry instead of hover alone. */
const TOUCH_ANSWER = /\btouch:|group-data-\[ask-tapped\]/;

const VIEWPORT_VH = /\b100vh\b|(?<![\w-])(?:min-)?h-screen\b/;

/**
 * Deliberate exceptions, each a line that must still exist — a stale entry
 * fails the spec, so this list cannot outlive the code it excuses.
 */
const ALLOWED: { file: string; line: RegExp; why: string }[] = [
  {
    file: "src/components/dashboard/team/roster-table.tsx",
    line: /text-\[var\(--ink-400\)\] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100/,
    why: "Lineup grip shares its cell with the spot number; a touch focuses the row, so group-focus-within shows it on the touched row only.",
  },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

function codeLines(): { file: string; n: number; text: string }[] {
  return SCANNED.flatMap((dir) => walk(path.join(ROOT, dir))).flatMap(
    (full) => {
      const file = path.relative(ROOT, full);
      return readFileSync(full, "utf8")
        .split("\n")
        .map((text, i) => ({ file, n: i + 1, text }))
        .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
    },
  );
}

const allowed = (file: string, text: string) =>
  ALLOWED.some((a) => a.file === file && a.line.test(text));

test("every hover-revealed element says what touch does", () => {
  const offenders = codeLines()
    .filter(({ text }) => HOVER_REVEAL.test(text) && !TOUCH_ANSWER.test(text))
    .filter(({ file, text }) => !allowed(file, text))
    .map(({ file, n, text }) => `${file}:${n}  ${text.trim()}`);
  expect(offenders, "add touch:opacity-100 (or a tapped state)").toEqual([]);
});

test("no viewport height in vh", () => {
  const offenders = codeLines()
    .filter(({ text }) => VIEWPORT_VH.test(text))
    .map(({ file, n, text }) => `${file}:${n}  ${text.trim()}`);
  expect(offenders, "use dvh (h-dvh, min-h-dvh, calc(100dvh-…))").toEqual([]);
});

test("every exception still exists", () => {
  const lines = codeLines();
  for (const a of ALLOWED) {
    expect(
      lines.some(({ file, text }) => file === a.file && a.line.test(text)),
      `stale exception: ${a.file} — ${a.why}`,
    ).toBe(true);
  }
});
