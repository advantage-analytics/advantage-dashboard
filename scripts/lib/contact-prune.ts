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
 * `program_contacts` is unique on the raw `(program_id, email)`, and both of
 * its writers store the email lowercased (the seed here, the admin console's
 * `inviteToClaim` from a lowercased address). Comparing lowercased and trimmed
 * keeps the diff honest if a row ever arrives otherwise: a stray space or a
 * capital must not read as a departure.
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

/**
 * The scraped rows the seed may upsert: every one except those landing on an
 * existing `admin` row for the same program and email.
 *
 * The upsert conflicts on `(program_id, email)` and overwrites the row it hits,
 * `source` included. Letting a scraped row hit an admin one would relabel it
 * `scrape`, replace the name and role an admin typed, and hand it to the next
 * prune whose scrape no longer lists it. Skipping the row leaves the admin's
 * record exactly as it was; the address is on the staff list either way.
 */
export function withoutAdminCollisions<
  T extends { program_id: string; email: string },
>(rows: readonly T[], existing: readonly ExistingContact[]): T[] {
  const adminKeys = new Set(
    existing
      .filter((row) => row.source === "admin")
      .map((row) => `${row.program_id} ${normalizeEmail(row.email)}`),
  );
  return rows.filter(
    (row) => !adminKeys.has(`${row.program_id} ${normalizeEmail(row.email)}`),
  );
}
