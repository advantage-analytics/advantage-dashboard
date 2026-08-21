/**
 * Minimal RFC4180 reader, shared by the seed and parity scripts.
 *
 * The claim dataset quotes fields containing commas (conference names, school
 * names with ", Reno"), so a naive split drops columns silently — which shows
 * up much later as a program with the wrong division.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** '' → null, so an absent CSV value does not become an empty-string row. */
export const orNull = (v: string | undefined): string | null =>
  v == null || v.trim() === '' ? null : v.trim();

/** Strict truthiness, matching the dataset's own `_is_true`. Fails closed. */
export const asBool = (v: string | undefined): boolean =>
  typeof v === 'string' && ['true', 't', 'yes', '1'].includes(v.trim().toLowerCase());

export const asInt = (v: string | undefined): number => {
  const n = Number.parseInt((v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
