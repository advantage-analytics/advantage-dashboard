/**
 * The seed's prune diff, kept pure so it can be pinned by an offline spec.
 * No Supabase, no fs — `scripts/seed-programs.ts` does the reading and the
 * deleting; this only decides which ids go.
 */

export type ExistingContact = {
  id: string;
  program_id: string;
  email: string;
  source: string;
};

/**
 * `program_contacts` is unique on `(program_id, lower(email))`, so that is the
 * identity the diff compares on. Trimmed as well: the seed trims before it
 * writes, and a stray space in either side must not read as a departure.
 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Ids of existing rows the seed may delete: `source === "scrape"`, on a
 * program the dataset covers, whose email is no longer among that program's
 * dataset emails.
 *
 * `dataset` maps program id → that program's scraped emails. A program with a
 * key but no emails IS covered (its whole scraped staff departed); a program
 * with no key is not, and its rows are never touched. Admin rows are never
 * returned, whatever their email.
 */
export function staleScrapeContacts(
  existing: readonly ExistingContact[],
  dataset: ReadonlyMap<string, readonly string[]>,
): string[] {
  const emailsFor = new Map<string, Set<string>>();
  for (const [programId, emails] of dataset) {
    emailsFor.set(programId, new Set(emails.map(normalizeEmail)));
  }

  return existing
    .filter((row) => {
      if (row.source !== "scrape") return false;
      const emails = emailsFor.get(row.program_id);
      if (!emails) return false;
      return !emails.has(normalizeEmail(row.email));
    })
    .map((row) => row.id);
}
