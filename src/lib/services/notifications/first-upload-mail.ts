import type { SupabaseClient } from "@supabase/supabase-js";
import {
  firstUploadNudgeEmail,
  sendEmail,
  type EmailMessage,
  type FirstUploadStep,
} from "@/lib/services/email";
import { OUTREACH_SEND_GAP_MS } from "@/lib/services/email/config";
import { unsubscribeLinks } from "@/lib/services/email/unsubscribe";
import { claimSend } from "./should-notify";

const LOG = "[notifications:first-upload]";

/**
 * When each step goes out, as an age since sign-up. The windows do not
 * overlap, so one run never sends both steps to one person, and a person who
 * signs up on a day the cron misses still gets each step a day later. Past
 * fourteen days nobody is mailed: a sign-up that old is the win-back
 * sequence's job, which does not exist yet, and the cut-off is also what
 * keeps the first run from mailing every old account at once.
 */
export interface FirstUploadWindow {
  step: FirstUploadStep;
  minDays: number;
  maxDays: number;
}

export const FIRST_UPLOAD_STEPS: readonly FirstUploadWindow[] = [
  { step: 1, minDays: 2, maxDays: 7 },
  { step: 2, minDays: 7, maxDays: 14 },
];

/**
 * Emails per run, both steps together. A daily run, so this is the daily
 * total too, and it leaves room under Resend's free-plan 100 a day for the
 * mail people are waiting on (`docs/email-system.md` §9). Anyone left over is
 * still in their window tomorrow.
 *
 * Sends are spaced by `OUTREACH_SEND_GAP_MS`: each one is two Resend calls
 * (the suppression check, then the send) against a limit of two a second, and
 * the key is claimed before the send, so a 429 would cost that person the
 * email for good. Forty sends at that pace fit the route's 60 seconds.
 */
const MAX_PER_RUN = 40;

/**
 * Stop claiming after this long. The route is killed at 60 seconds, and a
 * kill between a claim and its send spends that person's step with no email,
 * so a slow Resend day ends the run early instead; whoever is left is still
 * in their window tomorrow. Twenty seconds short of the limit covers one more
 * send at its worst (two 10-second timeouts).
 */
const TIME_BUDGET_MS = 40_000;

export interface FirstUploadCandidate {
  user_id: string;
  email: string;
  first_name: string | null;
}

export interface FirstUploadSweepResult {
  /** Why nothing was sent at all, when that is the answer. */
  skipped: "no_postal_address" | null;
  /** True when the run stopped at `TIME_BUDGET_MS` with people still owed. */
  outOfTime: boolean;
  sent: Record<FirstUploadStep, number>;
}

export interface FirstUploadSweepDeps {
  candidates: (
    db: SupabaseClient,
    window: FirstUploadWindow,
    limit: number,
  ) => Promise<FirstUploadCandidate[] | null>;
  claim: (dedupeKey: string) => Promise<boolean>;
  send: (message: EmailMessage) => Promise<{ ok: boolean; error?: string }>;
  postalAddress: () => string | null;
  links: typeof unsubscribeLinks;
  pause: (ms: number) => Promise<void>;
  now: () => number;
}

const productionDeps: FirstUploadSweepDeps = {
  candidates: readCandidates,
  claim: claimSend,
  send: sendEmail,
  postalAddress: () => process.env.OUTREACH_POSTAL_ADDRESS?.trim() || null,
  links: unsubscribeLinks,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/** One email per step per person, whatever the cron does. The prefix is
 *  what the candidate query matches against to leave the mailed out. */
function claimPrefix(step: FirstUploadStep): string {
  return `first_upload_nudge:${step}:`;
}

export function firstUploadClaimKey(
  step: FirstUploadStep,
  userId: string,
): string {
  return `${claimPrefix(step)}${userId}`;
}

/**
 * Mail the people who signed up and have not added a match.
 *
 * Who is a candidate is decided in Postgres
 * (`first_upload_nudge_candidates`): the sign-up window, not an admin, in no
 * program, "Tips for getting started" on, and no match or processing job. A
 * team member is left out on purpose — team onboarding is a different
 * sequence, not built yet.
 *
 * Refuses to send anything without a postal address: this is mail the
 * recipient did not just cause, and CAN-SPAM wants the address in it. The
 * same `OUTREACH_POSTAL_ADDRESS` the cold outreach uses.
 *
 * `db` must be the service-role client. Never throws.
 */
export async function sweepFirstUploadNudges(
  db: SupabaseClient,
  deps: FirstUploadSweepDeps = productionDeps,
): Promise<FirstUploadSweepResult> {
  const result: FirstUploadSweepResult = {
    skipped: null,
    outOfTime: false,
    sent: { 1: 0, 2: 0 },
  };

  const postalAddress = deps.postalAddress();
  if (!postalAddress) {
    console.error(
      `${LOG} OUTREACH_POSTAL_ADDRESS is not set — sending nothing`,
    );
    result.skipped = "no_postal_address";
    return result;
  }

  const startedAt = deps.now();
  let budget = MAX_PER_RUN;
  let first = true;
  try {
    for (const window of FIRST_UPLOAD_STEPS) {
      const { step } = window;
      if (budget <= 0) break;
      const rows = await deps.candidates(db, window, budget);
      if (!rows) continue;

      for (const row of rows) {
        if (budget <= 0) break;
        const to = row.email?.trim();
        if (!to) continue;
        const unsubscribe = deps.links(row.user_id);
        if (!unsubscribe) {
          console.error(`${LOG} no unsubscribe key — sending nothing`);
          return result;
        }
        // Pause and check the clock BEFORE claiming: nothing may stand
        // between a claim and its send that a kill could land in.
        if (!first) await deps.pause(OUTREACH_SEND_GAP_MS);
        first = false;
        if (deps.now() - startedAt > TIME_BUDGET_MS) {
          result.outOfTime = true;
          return result;
        }
        if (!(await deps.claim(firstUploadClaimKey(step, row.user_id)))) {
          continue;
        }
        budget -= 1;
        const sent = await deps.send(
          firstUploadNudgeEmail({
            to,
            step,
            firstName: row.first_name,
            unsubscribe,
            postalAddress,
          }),
        );
        if (sent.ok) {
          result.sent[step] += 1;
        } else {
          console.warn(`${LOG} email not delivered`, {
            step,
            error: sent.error,
          });
        }
      }
    }
  } catch (error) {
    console.error(`${LOG} threw`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

/**
 * Candidates for one window who are still owed its email. The mailed are left
 * out in Postgres, so `limit` is spent on people this run can actually send to.
 */
async function readCandidates(
  db: SupabaseClient,
  { step, minDays, maxDays }: FirstUploadWindow,
  limit: number,
): Promise<FirstUploadCandidate[] | null> {
  const { data, error } = await db.rpc("first_upload_nudge_candidates", {
    p_min_age: `${minDays} days`,
    p_max_age: `${maxDays} days`,
    p_dedupe_prefix: claimPrefix(step),
    p_limit: limit,
  });
  if (error) {
    console.error(`${LOG} could not read candidates`, {
      step,
      error: error.message,
    });
    return null;
  }
  return (data ?? []) as FirstUploadCandidate[];
}
