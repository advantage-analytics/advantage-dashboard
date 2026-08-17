/**
 * Differential test: our TypeScript matcher vs the dataset's Python reference,
 * over every recorded program contact.
 *
 *   npx tsx scripts/verify-domain-match-parity.ts <dataset-dir>
 *
 * The unit suite proves the port against the cases the reference asserts. This
 * proves it against the 3,000-odd real addresses the dataset was built from,
 * which is where a normalisation difference would actually surface — a stray
 * subdomain, an unusual suffix, a `.com` athletics host.
 *
 * Emits the same pipe-delimited shape as `emit_py.py` so the two can be diffed
 * directly. Any difference is a bug in the port, not a judgement call: the
 * dataset's `domain_match_skips_review` was computed by the Python, so a
 * disagreement means we would auto-approve a claim it decided needs a human.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkClaimEmail } from '../src/lib/services/programs/domain-match';

/** Minimal RFC4180-ish reader — the dataset quotes fields containing commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const dir = process.argv[2] ?? '/Users/cjgimena/Desktop/advantage-program-claim-dataset';
const read = (f: string) => parseCsv(readFileSync(join(dir, f), 'utf8'));

const programs = new Map(read('programs.csv').map((p) => [p.program_id, p]));

const lines: string[] = [];
for (const c of read('program_contacts.csv')) {
  const p = programs.get(c.program_id);
  if (!p) continue;
  const r = checkClaimEmail(c.email, p);
  lines.push(
    [
      c.program_id,
      r.email,
      r.domain,
      r.registrable,
      r.domainMatched ? 1 : 0,
      r.matchedOn,
      r.skipsManualReview ? 1 : 0,
    ].join('|')
  );
}

lines.sort();
process.stdout.write(lines.join('\n') + '\n');
