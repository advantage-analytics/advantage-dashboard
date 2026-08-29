import { readFileSync } from 'node:fs';

/**
 * Minimal `.env.local` loader (no dotenv dependency), shared by the scripts.
 *
 * Guarded: on a fresh checkout or a CI box there is no `.env.local`, and an
 * unhandled ENOENT would replace each script's readable "Missing X" messages
 * with a raw stack trace — env may legitimately come from the shell instead.
 * Values already present in the environment are never overwritten.
 */
export function loadEnvLocal(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
      }
    }
  } catch {
    /* fall through to each script's own required() checks */
  }
}
