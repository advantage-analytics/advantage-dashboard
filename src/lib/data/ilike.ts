/**
 * Escape a literal for `ilike`: `%`, `_` and `\` are wildcards or escapes,
 * and text containing one would otherwise match somebody else's row.
 */
export function ilikeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
