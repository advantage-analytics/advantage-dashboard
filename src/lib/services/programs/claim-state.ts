/**
 * The program claim state machine.
 *
 * Pure — no I/O, no clock, no database. Transitions in, transitions out. The
 * route handlers own the side effects; this owns whether a move is legal.
 *
 * Isolated for the same reason `webhook-payload.ts` is: this decides who ends
 * up owning a collegiate program, and that decision should be readable and
 * testable without standing up Supabase and an email provider.
 *
 *   unclaimed
 *     -> pending_email      claim submitted, magic link sent
 *     -> pending_review     link clicked, no domain match
 *     -> objection_window   link clicked and domain matched, or review approved
 *     -> approved           window elapsed with nobody objecting
 *     -> rejected           a human said no. Terminal.
 *     -> objected           somebody at the school said no. Terminal, routes to a human.
 *
 * A program in `objection_window` is FULLY USABLE. The window runs behind the
 * scenes and only matters if somebody objects — making a coach wait a day to
 * use a workspace nobody disputed would be a cost paid on every claim to
 * protect against the rare one.
 *
 * A program in `pending_review` can invite and browse but cannot submit video.
 * That is the one capability worth withholding, because it spends the vendor
 * budget and cannot be taken back.
 */

export type ClaimStatus =
  | 'pending_email'
  | 'pending_review'
  | 'objection_window'
  | 'approved'
  | 'rejected'
  | 'objected';

export type ProgramStatus = 'unclaimed' | 'claim_pending' | 'active' | 'suspended';

export type ClaimEvent =
  /** The magic link was clicked. Routing depends on the domain check. */
  | { type: 'verify_email'; domainMatched: boolean }
  /** An admin approved a claim that failed the domain check. */
  | { type: 'approve' }
  /** An admin rejected it. */
  | { type: 'reject' }
  /** Somebody at the school objected. */
  | { type: 'object' }
  /** The objection window elapsed with no objection. */
  | { type: 'settle' }
  /** The magic link expired unused. */
  | { type: 'expire' };

/**
 * Apply an event. Returns the next status, or null if the move is illegal.
 *
 * Null rather than a thrown error or a silent no-op: callers have to decide
 * what an out-of-order event means — usually a double-clicked email link, which
 * should render "already done" rather than an error page.
 */
export function nextClaimStatus(
  current: ClaimStatus,
  event: ClaimEvent
): ClaimStatus | null {
  switch (current) {
    case 'pending_email':
      if (event.type === 'verify_email') {
        // The only place domain matching changes anything: whether a human
        // has to look. Both branches are live claims either way.
        return event.domainMatched ? 'objection_window' : 'pending_review';
      }
      if (event.type === 'expire') return 'rejected';
      return null;

    case 'pending_review':
      // An approved claim still gets announced and still serves its window.
      // Review answers "does this person work there", which is a different
      // question from "does anyone on staff dispute this".
      if (event.type === 'approve') return 'objection_window';
      if (event.type === 'reject') return 'rejected';
      if (event.type === 'object') return 'objected';
      return null;

    case 'objection_window':
      if (event.type === 'object') return 'objected';
      if (event.type === 'settle') return 'approved';
      return null;

    // Terminal. An objection after approval is a support conversation, not a
    // state transition — reversing ownership automatically would let anyone
    // holding an objection link evict a legitimate owner.
    case 'approved':
    case 'rejected':
    case 'objected':
      return null;
  }
}

/** Nothing more will happen to this claim without a person getting involved. */
export function isTerminal(status: ClaimStatus): boolean {
  return status === 'approved' || status === 'rejected' || status === 'objected';
}

/**
 * The program's status, derived from its live claim rather than stored twice.
 *
 * Two columns that must agree is two columns that eventually will not.
 */
export function programStatusFor(claim: ClaimStatus | null): ProgramStatus {
  if (claim === null) return 'unclaimed';

  switch (claim) {
    case 'pending_email':
    case 'pending_review':
      return 'claim_pending';
    // Usable immediately — see the header.
    case 'objection_window':
    case 'approved':
      return 'active';
    case 'rejected':
    case 'objected':
      return 'unclaimed';
  }
}

/** Can this program have video submitted against its budget yet? */
export function canSubmitVideo(claim: ClaimStatus | null): boolean {
  return claim === 'objection_window' || claim === 'approved';
}

/** Does a claim in this state need a human to look at it? */
export function needsReview(status: ClaimStatus): boolean {
  return status === 'pending_review' || status === 'objected';
}

// ---------------------------------------------------------------------------
// Timings
// ---------------------------------------------------------------------------

/** Magic links expire in a day. Long enough for a coach who checks email once. */
export const CLAIM_LINK_TTL_HOURS = 24;

/**
 * How long the objection window runs.
 *
 * 24 hours is a PROPOSAL, not a decision — it was never agreed with anyone.
 * It is a constant rather than a literal so that changing it is one edit, and
 * so this comment sits next to the number.
 */
export const OBJECTION_WINDOW_HOURS = 24;

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Why this claim reached a reviewer. Shown in the notification email so the
 * decision does not require opening the database.
 */
export function reviewReason(claim: {
  domainMatched: boolean;
  announcedRecipients: number;
  status: ClaimStatus;
}): string {
  if (claim.status === 'objected') return 'Someone objected to this claim';
  if (claim.announcedRecipients === 0) {
    return 'No other contacts on record — the claim went unannounced';
  }
  if (!claim.domainMatched) return 'Email domain did not match the school';
  return 'Manual review requested';
}
