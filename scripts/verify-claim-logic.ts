/**
 * Verify the pure claim logic.
 *
 * `npx tsx scripts/verify-claim-logic.ts`
 *
 * There is no unit-test runner in this project (Playwright is configured but
 * unused), and the claim state machine and domain matcher are exactly the code
 * that should not be verified by clicking through a UI. This is a plain script
 * so it runs with the tooling already here.
 *
 * The domain cases are the point. `utk.edu.example.com` must not match
 * `utk.edu` — that is the difference between a suffix check and a substring
 * check, and it is the difference between a program being safe and a program
 * being claimable by whoever registers a lookalike.
 */

import {
  normalizeHost,
  registrableDomain,
  matchesListed,
  isFreemail,
  isAcademic,
  checkClaimEmail,
  NOTE_REVIEW,
  NOTE_CONFIRM,
} from '../src/lib/services/programs/domain-match';
import {
  nextClaimStatus,
  programStatusFor,
  canSubmitVideo,
  isTerminal,
  needsReview,
  reviewReason,
  addHours,
  type ClaimStatus,
} from '../src/lib/services/programs/claim-state';
import {
  generateToken,
  hashToken,
  tokenMatches,
  isUsable,
  REVIEW_TOKEN_TTL_HOURS,
} from '../src/lib/services/programs/tokens';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    return;
  }
  failed++;
  console.error(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
}

// ---------------------------------------------------------------------------
// Domain matching — the reference suite from domain_match.py, ported case for
// case. Equivalence with the Python is the point: that file is the dataset's
// stated source of truth, and `domain_match_skips_review` was computed for all
// 1,940 programs by it. A TypeScript port that disagreed would auto-approve
// claims the dataset already decided need a human.
// ---------------------------------------------------------------------------

console.log('\nregistrableDomain');
check('athletics.wisc.edu', registrableDomain('athletics.wisc.edu'), 'wisc.edu');
check('vols.utk.edu', registrableDomain('vols.utk.edu'), 'utk.edu');
check('ox.ac.uk keeps 3 labels', registrableDomain('ox.ac.uk'), 'ox.ac.uk');
check('trailing dot', registrableDomain('utk.edu.'), 'utk.edu');
check('uppercase', registrableDomain('UTK.EDU'), 'utk.edu');

console.log('normalizeHost — malformed hosts rejected outright');
for (const bad of ['.utk.edu', '..utk.edu', 'utk..edu', '-utk.edu', 'utk-.edu',
                   'utk edu', 'utk', '', null, undefined]) {
  check(`normalizeHost(${JSON.stringify(bad)})`, normalizeHost(bad as string), '');
}
check('normalizeHost trims', normalizeHost(' utk.edu '), 'utk.edu');
check('normalizeHost drops trailing dot', normalizeHost('utk.edu.'), 'utk.edu');

console.log('matchesListed — the containment attack');
check('subdomain matches', matchesListed('vols.utk.edu', 'utk.edu'), true);
check('exact matches', matchesListed('utk.edu', 'utk.edu'), true);
check('containment must NOT match', matchesListed('utk.edu.example.com', 'utk.edu'), false);
check('prefix must NOT match', matchesListed('notutk.edu', 'utk.edu'), false);
check('suffix-no-dot must NOT match', matchesListed('xutk.edu', 'utk.edu'), false);
check('reverse must NOT match', matchesListed('utk.edu', 'vols.utk.edu'), false);
check('leading dot must NOT match', matchesListed('.utk.edu', 'utk.edu'), false);

console.log('isFreemail / isAcademic');
check('gmail', isFreemail('gmail.com'), true);
check('subdomain of gmail', isFreemail('mail.gmail.com'), true);
check('hotmail.co.uk', isFreemail('hotmail.co.uk'), true);
check('edu is not freemail', isFreemail('utk.edu'), false);
check('utk.edu academic', isAcademic('utk.edu'), true);
check('ox.ac.uk academic', isAcademic('ox.ac.uk'), true);
check('huskers.com not academic', isAcademic('huskers.com'), false);

console.log('checkClaimEmail');
const fake = {
  school_name: 'Test U',
  primary_domain: 'utk.edu',
  athletics_domains: 'vols.utk.edu',
  domain_match_skips_review: 'true',
};
const CASES: [string | null, boolean, boolean][] = [
  ['coach@utk.edu', true, true],
  ['coach@vols.utk.edu', true, true],
  ['coach@mail.vols.utk.edu', true, true],
  ['COACH@UTK.EDU', true, true],
  ['coach+tennis@utk.edu', true, true],
  ['coach@utk.edu.', true, true],
  ['coach@utk.edu.example.com', false, false],
  ['coach@.utk.edu', false, false],
  ['coach@..utk.edu', false, false],
  ['coach@ utk.edu', false, false],
  ['coach@gmail.com', false, false],
  ['coach@example.com', false, false],
  ['not-an-email', false, false],
  ['a@b@utk.edu', false, false],
  ['', false, false],
  [null, false, false],
];
for (const [addr, wantMatch, wantSkip] of CASES) {
  const r = checkClaimEmail(addr, fake);
  check(`${JSON.stringify(addr)} matched`, r.domainMatched, wantMatch);
  check(`${JSON.stringify(addr)} skips`, r.skipsManualReview, wantSkip);
}

const freemailResult = checkClaimEmail('coach@gmail.com', fake);
check('freemail routes to review', freemailResult.reason.includes('review'), true);
check('freemail gets the quiet note', freemailResult.inlineNote, NOTE_REVIEW);

// The non-freemail note must be one string for every school address — the same
// line whether the domain matches or not, so it can never be read as this
// address being recognised, and never flips into an enumeration oracle.
const matchedNote = checkClaimEmail('coach@utk.edu', fake).inlineNote;
const unmatchedNote = checkClaimEmail('coach@example.com', fake).inlineNote;
check('school address gets the confirm note', matchedNote, NOTE_CONFIRM);
check('unmatched domain gets the same note', unmatchedNote, matchedNote);
check(
  'confirm note says a person may check it',
  /a person will check it/.test(NOTE_CONFIRM),
  true
);
check(
  'confirm note never claims recognition',
  /recogni[sz]ed|approved/i.test(NOTE_CONFIRM),
  false
);

console.log('the guard must FAIL CLOSED on every non-true representation');
for (const value of ['false', 'False', false, 0, null, '', 'no', 'maybe', 'TRUE_ISH']) {
  check(
    `fails closed on ${JSON.stringify(value)}`,
    checkClaimEmail('coach@utk.edu', {
      ...fake,
      domain_match_skips_review: value as string | boolean | null,
    }).skipsManualReview,
    false
  );
}
for (const value of ['true', 'True', true, 'yes', '1']) {
  check(
    `opens on ${JSON.stringify(value)}`,
    checkClaimEmail('coach@utk.edu', {
      ...fake,
      domain_match_skips_review: value as string | boolean,
    }).skipsManualReview,
    true
  );
}

console.log('a match that is not specific enough still routes to review');
const arr = { ...fake, athletics_domains: ['vols.utk.edu', 'utsports.com'] };
check('text[] athletics_domains works', checkClaimEmail('coach@vols.utk.edu', arr).domainMatched, true);
// The fourth guard: matched, but .com cannot identify an institution.
check('non-academic match does not skip', checkClaimEmail('coach@utsports.com', arr).skipsManualReview, false);
check('non-academic still counts as matched', checkClaimEmail('coach@utsports.com', arr).domainMatched, true);
check('no recorded domain', checkClaimEmail('coach@utk.edu', {
  school_name: 'X', primary_domain: null, athletics_domains: null,
}).reason, 'no recorded domain for this program');

console.log('nextClaimStatus');
check('verify + match', nextClaimStatus('pending_email', { type: 'verify_email', domainMatched: true }), 'objection_window');
check('verify no match', nextClaimStatus('pending_email', { type: 'verify_email', domainMatched: false }), 'pending_review');
check('link expires', nextClaimStatus('pending_email', { type: 'expire' }), 'rejected');
check('approve routes to window', nextClaimStatus('pending_review', { type: 'approve' }), 'objection_window');
check('reject', nextClaimStatus('pending_review', { type: 'reject' }), 'rejected');
check('object during review', nextClaimStatus('pending_review', { type: 'object' }), 'objected');
check('object during window', nextClaimStatus('objection_window', { type: 'object' }), 'objected');
check('settle', nextClaimStatus('objection_window', { type: 'settle' }), 'approved');

console.log('nextClaimStatus — illegal moves return null');
check('cannot approve a pending_email', nextClaimStatus('pending_email', { type: 'approve' }), null);
check('cannot settle before verifying', nextClaimStatus('pending_email', { type: 'settle' }), null);
check('cannot re-verify after review', nextClaimStatus('pending_review', { type: 'verify_email', domainMatched: true }), null);
check('cannot object after approval', nextClaimStatus('approved', { type: 'object' }), null);
check('cannot revive a rejection', nextClaimStatus('rejected', { type: 'approve' }), null);
check('cannot revive an objection', nextClaimStatus('objected', { type: 'settle' }), null);
for (const terminal of ['approved', 'rejected', 'objected'] as ClaimStatus[]) {
  check(`${terminal} is inert`, nextClaimStatus(terminal, { type: 'settle' }), null);
}

console.log('programStatusFor');
check('no claim', programStatusFor(null), 'unclaimed');
check('pending_email', programStatusFor('pending_email'), 'claim_pending');
check('pending_review', programStatusFor('pending_review'), 'claim_pending');
check('objection_window is active', programStatusFor('objection_window'), 'active');
check('approved', programStatusFor('approved'), 'active');
check('rejected frees the program', programStatusFor('rejected'), 'unclaimed');
check('objected frees the program', programStatusFor('objected'), 'unclaimed');

console.log('canSubmitVideo');
check('not before verification', canSubmitVideo('pending_email'), false);
check('not while under review', canSubmitVideo('pending_review'), false);
check('yes during the window', canSubmitVideo('objection_window'), true);
check('yes once approved', canSubmitVideo('approved'), true);
check('no when objected', canSubmitVideo('objected'), false);

console.log('isTerminal / needsReview');
check('pending_email is live', isTerminal('pending_email'), false);
check('objection_window is live', isTerminal('objection_window'), false);
check('approved is terminal', isTerminal('approved'), true);
check('rejected is terminal', isTerminal('rejected'), true);
check('objected is terminal', isTerminal('objected'), true);
check('pending_review needs a human', needsReview('pending_review'), true);
check('objected needs a human', needsReview('objected'), true);
check('objection_window does not', needsReview('objection_window'), false);
check('approved does not', needsReview('approved'), false);

console.log('reviewReason');
check('objection wins over everything', reviewReason({
  domainMatched: true, announcedRecipients: 5, status: 'objected',
}), 'Someone objected to this claim');
check('unannounced is called out', reviewReason({
  domainMatched: false, announcedRecipients: 0, status: 'pending_review',
}), 'No other contacts on record — the claim went unannounced');
check('domain miss', reviewReason({
  domainMatched: false, announcedRecipients: 3, status: 'pending_review',
}), 'Email domain did not match the school');

console.log('addHours');
const t0 = new Date('2026-08-16T00:00:00.000Z');
check('24h', addHours(t0, 24).toISOString(), '2026-08-17T00:00:00.000Z');
check('review ttl is a week', addHours(t0, REVIEW_TOKEN_TTL_HOURS).toISOString(),
  '2026-08-23T00:00:00.000Z');
check('does not mutate its input', t0.toISOString(), '2026-08-16T00:00:00.000Z');

console.log('isUsable');
const later = '2026-08-17T00:00:00.000Z';
const earlier = '2026-08-15T00:00:00.000Z';
check('live', isUsable({ expiresAt: later, consumedAt: null }, t0), true);
check('expired', isUsable({ expiresAt: earlier, consumedAt: null }, t0), false);
check('already used', isUsable({ expiresAt: later, consumedAt: earlier }, t0), false);
check('no expiry fails closed', isUsable({ expiresAt: null, consumedAt: null }, t0), false);
check('garbage fails closed', isUsable({ expiresAt: 'not-a-date', consumedAt: null }, t0), false);

console.log('tokens');
const token = generateToken();
check('token is url safe', /^[A-Za-z0-9_-]+$/.test(token), true);
check('distinct tokens', generateToken() === generateToken(), false);
check('hash is stable', hashToken('abc') === hashToken('abc'), true);
check('hash is 64 hex', /^[0-9a-f]{64}$/.test(hashToken('abc')), true);
check('matches itself', tokenMatches(token, hashToken(token)), true);
check('rejects another token', tokenMatches(generateToken(), hashToken(token)), false);
check('rejects a short hash', tokenMatches(token, 'deadbeef'), false);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
