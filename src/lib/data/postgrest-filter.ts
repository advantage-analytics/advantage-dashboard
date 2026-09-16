/**
 * Quote a value for PostgREST's `or=`/`and=` mini-language.
 *
 * That grammar treats `,`, `.`, `(` and `)` as syntax — this dataset's school
 * names routinely contain commas ("University of California, Los Angeles" is
 * a real row) and an ISO timestamp's fractional-seconds `.` needs it too. A
 * value carrying any of those characters has to be wrapped in double quotes,
 * with internal backslashes and quotes escaped.
 */
export function pgQuoteValue(value: string): string {
  if (/[,."()]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
