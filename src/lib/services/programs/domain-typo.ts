import {
  asList,
  emailDomain,
  isFreemail,
  matchesListed,
  normalizeHost,
  registrableDomain,
  type ClaimProgram,
} from "./domain-match";

/**
 * Did the claimant mistype the school's domain?
 *
 * `perez_d81630@utpd.edu` on UTPB's form (whose domain is `utpb.edu`) went out,
 * bounced, and the claim form had already said "check your inbox" — the coach
 * waited eighteen days for a link that never left Resend. Both bounced claim
 * confirmations on record were domain typos.
 *
 * So: a typed domain one keystroke away from a domain this program lists —
 * two for a long one — is almost certainly that domain, and we offer it.
 *
 * ── What this may know ──────────────────────────────────────────────────────
 * Only the program's recorded DOMAINS, which are public (the setup page reads
 * them as anon). Never `program_contacts`: the suggestion swaps the domain and
 * keeps the local part exactly as typed, so nothing here can confirm or deny
 * that a person is on the staff list — see NOTE_REVIEW in `domain-match.ts`.
 *
 * A courtesy, like the inline note: the claimant can keep what they typed, and
 * the server never consults this.
 */
export function suggestSchoolEmail(
  email: string | null | undefined,
  program: ClaimProgram,
): string | null {
  const typed = emailDomain(email);
  if (!typed || isFreemail(typed)) return null;

  const listed = listedDomains(program);
  if (listed.length === 0) return null;

  // Already right, or a subdomain of a right one (`athletics.utpb.edu`).
  if (listed.some((l) => matchesListed(typed, l))) return null;

  // Compare the typed host, and its registrable part so a typo under a
  // subdomain (`mail.utpd.edu`) still finds `utpb.edu`.
  const candidates = [...new Set([typed, registrableDomain(typed)])];

  let best: { domain: string; distance: number } | null = null;
  for (const domain of listed) {
    for (const candidate of candidates) {
      const distance = editDistance(candidate, domain);
      if (distance === 0 || distance > allowance(domain)) continue;
      // Ties keep the earlier domain, and the primary is listed first.
      if (!best || distance < best.distance) best = { domain, distance };
    }
  }
  if (!best) return null;

  const local = String(email).trim().toLowerCase().split("@")[0];
  return `${local}@${best.domain}`;
}

/** Primary first, then athletics — the order ties resolve in. */
function listedDomains(program: ClaimProgram): string[] {
  const all = [
    normalizeHost(program.primary_domain),
    ...asList(program.athletics_domains),
  ].filter(Boolean);
  return [...new Set(all)];
}

/**
 * How far off a domain may be and still be offered. One edit for short ones:
 * `utk.edu` and `uta.edu` are both real schools, and two edits apart would
 * reach most three-letter names. Two for a long one, where a pair of slips is
 * still unmistakable.
 */
function allowance(domain: string): number {
  return domain.length >= 12 ? 2 : 1;
}

/**
 * Optimal string alignment distance: insertions, deletions, substitutions and
 * a swap of two neighbours (`uptb` for `utpb`) each cost one.
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
