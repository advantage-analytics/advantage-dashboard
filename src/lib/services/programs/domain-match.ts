/**
 * Does a claimed email address belong to the school it claims?
 *
 * A faithful port of `domain_match.py` from the program-claim dataset, whose
 * README names it the single source of truth for domain normalisation and asks
 * for it to be ported as-is. Pure — no I/O, no clock.
 *
 * ── Two questions, not one ──────────────────────────────────────────────────
 * `domainMatched` and `skipsManualReview` are SEPARATE answers, and the
 * distinction is the whole point. A match can be real and still not be specific
 * enough to act on. An earlier version of this file collapsed them into one
 * boolean and would have auto-approved every case the four guards below exist
 * to catch.
 *
 * ── What this decides now: nothing ──────────────────────────────────────────
 * It used to decide whether a claim skipped review. It no longer does. What
 * approves a claim is an EXACT match against `program_contacts` — the address
 * recorded for this team's staff — checked server-side inside
 * `complete_program_claim`, which this module cannot see and must not.
 *
 * Both answers here are now EVIDENCE, recorded on the claim and shown to whoever
 * reviews it. A domain match says "someone at this school", which is a student,
 * an alum with a lifetime address, or anyone in the faculty; that was never
 * enough on its own, and the announcement that used to backstop it was cut.
 *
 * A non-match is still never a rejection. Many D2, D3 and NAIA coaches have no
 * institutional address at all; they route to review and a human approves them.
 *
 * ── The four guards ─────────────────────────────────────────────────────────
 * Each was a live auto-claim vulnerability found while building the dataset.
 * Three are precomputed per program into `domain_match_skips_review`; the
 * fourth is checked here, against the domain that actually matched.
 *
 *   1. School identity is name + state, not name. Glendale Community College
 *      exists in AZ and CA; keying on name alone pooled their evidence and let
 *      an @gccaz.edu address claim the California program.
 *   2. Shared domains route to review — 90 programs. `cuny.edu` covers 14. A
 *      match there says the claimant works somewhere in the system, not at this
 *      campus.
 *   3. Inferred parent domains route to review — 75 programs. `af.edu`,
 *      inferred from a USAFA address, would open the claim to the entire Air
 *      Force.
 *   4. Non-academic domains route to review — 28 programs, checked below.
 *      `nighteaglewilderness.com` was the highest-evidence domain at one school
 *      and `chainbridgebank.com` at another. Both would have auto-claimed.
 *
 * The check FAILS CLOSED throughout: anything malformed, unrecognised or
 * ambiguous routes to review.
 */

/** Never an institutional match. Routes to review; never a rejection on its own. */
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.co.uk', 'hotmail.com',
  'hotmail.co.uk', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me',
  'protonmail.com', 'pm.me', 'tuta.io', 'tutanota.com', 'aol.com', 'aim.com',
  'gmx.com', 'gmx.net', 'web.de', 'yandex.com', 'yandex.ru', 'qq.com',
  'mail.ru', 'mail.com', 'zoho.com', 'fastmail.com', 'hey.com', 'duck.com',
  'mailinator.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
  'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net', 'juno.com',
]);

const MULTI_SUFFIX = new Set([
  'ac.uk', 'sch.uk', 'co.uk', 'org.uk', 'edu.au', 'com.au', 'edu.mx',
  'edu.co', 'edu.br', 'ac.jp', 'edu.sg', 'edu.ph', 'co.nz', 'ac.nz', 'edu.pr',
]);

/**
 * Only these suffixes identify an educational institution. A .com may well be a
 * real athletics site, but it may equally be a coach's own business — the
 * dataset contains both. Non-academic domains can match; they never skip review.
 */
const ACADEMIC_SUFFIX = new Set<string>([
  'edu',
  ...[...MULTI_SUFFIX].filter((s) => s.startsWith('ac.') || s.startsWith('edu.')),
]);

/**
 * The only two things the browser may say about an address.
 *
 * It must NOT say whether the address is on the program's recorded staff list,
 * because that is what decides the claim. A note that flipped on a match would
 * be an enumeration oracle: type addresses until it changes and you have
 * harvested 3,117 real people's work emails out of `program_contacts`.
 *
 * So the split is on freemail, which is the one thing that is both knowable
 * here and always true. `complete_program_claim` requires `not is_freemail`
 * before it auto-approves, so a personal address genuinely always reaches a
 * person — and freemail-ness is computed from the public list above, not from
 * anything of ours.
 *
 * Everything else gets a line that states the rule without saying which side
 * of it THIS address falls on, because for a school address the honest answer
 * is that this screen does not know. It has to say the rule out loud: a bare
 * "we'll send a link to confirm it's yours", read next to the personal
 * address's "we'll confirm this one manually", was taken as recognition — a
 * UCLA address typed on Michigan's form looked approved.
 */
export const NOTE_REVIEW =
  'A personal address always needs a manual check. A school address is usually quicker.';

export const NOTE_CONFIRM =
  "We'll send a link here to confirm it's yours. Unless it's on the program's " +
  "staff list, a person will check it.";

/**
 * Hostname labels: letters, digits, hyphens; no empty labels, no leading or
 * trailing hyphen, at least two labels.
 *
 * A loop rather than the reference's single regex, which uses lookbehind —
 * Safari only gained that in 16.4, and this runs in the browser on the claim
 * form.
 */
function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  return labels.every(
    (l) =>
      l.length >= 1 &&
      l.length <= 63 &&
      /^[a-z0-9-]+$/.test(l) &&
      !l.startsWith('-') &&
      !l.endsWith('-')
  );
}

/** Lowercase, trim, drop trailing dots. Empty string if not a valid host. */
export function normalizeHost(domain: string | null | undefined): string {
  if (typeof domain !== 'string') return '';
  let d = domain.trim().toLowerCase();
  while (d.endsWith('.')) d = d.slice(0, -1);
  return isValidHost(d) ? d : '';
}

/** `athletics.wisc.edu` → `wisc.edu`, with multi-label suffixes handled. */
export function registrableDomain(domain: string | null | undefined): string {
  const d = normalizeHost(domain);
  if (!d) return '';
  const parts = d.split('.');
  if (parts.length >= 3 && MULTI_SUFFIX.has(parts.slice(-2).join('.'))) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/** The domain part of an address, normalised. Empty unless exactly one address. */
export function emailDomain(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  const e = email.trim().toLowerCase();
  if ((e.match(/@/g) ?? []).length !== 1 || /\s/.test(e)) return '';
  const [local, host] = e.split('@');
  if (!local) return '';
  return normalizeHost(host);
}

export function isFreemail(domain: string | null | undefined): boolean {
  const d = normalizeHost(domain);
  if (!d) return false;
  return FREEMAIL.has(d) || FREEMAIL.has(registrableDomain(d));
}

export function isAcademic(domain: string | null | undefined): boolean {
  const d = normalizeHost(domain);
  if (!d) return false;
  const parts = d.split('.');
  return (
    ACADEMIC_SUFFIX.has(parts[parts.length - 1]) ||
    ACADEMIC_SUFFIX.has(parts.slice(-2).join('.'))
  );
}

/**
 * Exact match, or a STRICT subdomain.
 *
 *   vols.utk.edu     vs utk.edu -> true
 *   utk.edu          vs utk.edu -> true
 *   utk.edu.evil.com vs utk.edu -> false   (containment, not a subdomain)
 *
 * The leading dot in the suffix test is the entire security property. Without
 * it, whoever registers the lookalike claims the program.
 */
export function matchesListed(
  candidate: string | null | undefined,
  listed: string | null | undefined
): boolean {
  const c = normalizeHost(candidate);
  const l = normalizeHost(listed);
  if (!c || !l) return false;
  return c === l || c.endsWith(`.${l}`);
}

/** `athletics_domains` arrives `;`-joined from CSV or as a `text[]` from Postgres. */
function asList(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : String(value).split(';');
  return items.map(normalizeHost).filter(Boolean);
}

/** Strict truthiness — anything unrecognised is false, so the guard fails closed. */
function isTrue(value: boolean | string | number | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return (
    typeof value === 'string' &&
    ['true', 't', 'yes', '1'].includes(value.trim().toLowerCase())
  );
}

export interface ClaimProgram {
  school_name?: string | null;
  primary_domain?: string | null;
  athletics_domains?: string | string[] | null;
  /** The precomputed guard. The claim route reads THIS, not its own arithmetic. */
  domain_match_skips_review?: boolean | string | number | null;
}

export interface ClaimCheck {
  email: string;
  domain: string;
  registrable: string;
  /** The address belongs to a domain we have actually observed at this school. */
  domainMatched: boolean;
  /** Which listed domain matched, if any. */
  matchedOn: string;
  /** Whether that match is specific enough to skip a human. */
  skipsManualReview: boolean;
  /** Why, in words. Goes into the admin review email. */
  reason: string;
  /**
   * The quiet line under the email field. Never blocking, and deliberately
   * unable to predict the outcome — see NOTE_REVIEW.
   */
  inlineNote: string;
}

export function checkClaimEmail(
  email: string | null | undefined,
  program: ClaimProgram
): ClaimCheck {
  const domain = emailDomain(email);
  const registrable = registrableDomain(domain);

  const out = (
    domainMatched: boolean,
    matchedOn: string,
    skipsManualReview: boolean,
    reason: string
  ): ClaimCheck => ({
    email: typeof email === 'string' ? email.trim().toLowerCase() : '',
    domain,
    registrable,
    domainMatched,
    matchedOn,
    skipsManualReview,
    reason,
    // Deliberately NOT keyed on `skipsManualReview`. That reported the domain
    // decision, which stopped deciding anything when contact matching landed —
    // it told a recorded coach to expect a manual wait and then approved them
    // instantly, and told any student on a matching domain they were
    // "recognized" before routing them to review.
    inlineNote: isFreemail(domain) ? NOTE_REVIEW : NOTE_CONFIRM,
  });

  if (!domain) return out(false, '', false, 'malformed email address');

  if (isFreemail(domain)) {
    return out(false, '', false, 'personal email provider; routed to review');
  }

  const athletics = asList(program.athletics_domains);
  const primary = normalizeHost(program.primary_domain);

  if (!primary && athletics.length === 0) {
    return out(false, '', false, 'no recorded domain for this program');
  }

  // Athletics domains first — they are observed evidence, where a primary may
  // have been inferred from a subdomain and never seen directly.
  let matchedOn = '';
  for (const listed of athletics) {
    if (matchesListed(domain, listed) || matchesListed(registrable, listed)) {
      matchedOn = listed;
      break;
    }
  }
  if (
    !matchedOn &&
    primary &&
    (matchesListed(domain, primary) || matchesListed(registrable, primary))
  ) {
    matchedOn = primary;
  }
  if (!matchedOn) return out(false, '', false, 'no domain match; routed to review');

  // Matched. Whether that is specific enough to skip review is a separate
  // question, and for guards 1-3 the answer is precomputed per program.
  if (!isTrue(program.domain_match_skips_review)) {
    return out(
      true,
      matchedOn,
      false,
      `domain matched (${matchedOn}) but this program is flagged for review — ` +
        `shared, inferred, or non-academic domain`
    );
  }

  // Guard 4, checked against the domain that actually matched rather than the
  // program as a whole: a program can be eligible and still match on a .com.
  if (!isAcademic(matchedOn)) {
    return out(
      true,
      matchedOn,
      false,
      `domain matched (${matchedOn}) but it is not an academic domain`
    );
  }

  return out(true, matchedOn, true, `domain matched (${matchedOn})`);
}
