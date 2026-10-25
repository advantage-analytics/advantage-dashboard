import type { SupabaseClient } from "@supabase/supabase-js";
import {
  firstUploadNudgeEmail,
  sendEmail,
  type EmailMessage,
  type FirstUploadStep,
} from "@/lib/services/email";
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
 */
const MAX_PER_RUN = 40;

export interface FirstUploadCandidate {
  user_id: string;
  email: string;
  first_name: string | null;
}

export interface FirstUploadSweepResult {
  /** Why nothing was sent at all, when that is the answer. */
  skipped: "no_postal_address" | null;
  sent: Record<FirstUploadStep, number>;
}

export interface FirstUploadSweepDeps {
  candidates: (
    db: SupabaseClient,
    window: FirstUploadWindow,
  ) => Promise<FirstUploadCandidate[] | null>;
  claim: (dedupeKey: string) => Promise<boolean>;
  send: (message: EmailMessage) => Promise<{ ok: boolean; error?: string }>;
  postalAddress: () => string | null;
  links: typeof unsubscribeLinks;
}

const productionDeps: FirstUploadSweepDeps = {
  candidates: readCandidates,
  claim: claimSend,
  send: sendEmail,
  postalAddress: () => process.env.OUTREACH_POSTAL_ADDRESS?.trim() || null,
  links: unsubscribeLinks,
};

/** One email per step per person, whatever the cron does. */
export function firstUploadClaimKey(
  step: FirstUploadStep,
  userId: string,
): string {
  return `first_upload_nudge:${step}:${userId}`;
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

  let budget = MAX_PER_RUN;
  try {
    for (const window of FIRST_UPLOAD_STEPS) {
      const { step } = window;
      if (budget <= 0) break;
      const rows = await deps.candidates(db, window);
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
 * Candidates for one window, minus the ones already mailed for it. The read
 * of `notification_sends` is what stops a claimed key from being fetched
 * again every day for the rest of its window; `claimSend()` is still what
 * makes a send happen once.
 */
async function readCandidates(
  db: SupabaseClient,
  { step, minDays, maxDays }: FirstUploadWindow,
): Promise<FirstUploadCandidate[] | null> {
  const { data, error } = await db.rpc("first_upload_nudge_candidates", {
    p_min_age: `${minDays} days`,
    p_max_age: `${maxDays} days`,
    p_limit: 200,
  });
  if (error) {
    console.error(`${LOG} could not read candidates`, {
      step,
      error: error.message,
    });
    return null;
  }
  const rows = (data ?? []) as FirstUploadCandidate[];
  if (rows.length === 0) return rows;

  const { data: mailed, error: mailedError } = await db
    .from("notification_sends")
    .select("dedupe_key")
    .in(
      "dedupe_key",
      rows.map((row) => firstUploadClaimKey(step, row.user_id)),
    );
  if (mailedError) {
    console.error(`${LOG} could not read sent mail`, {
      error: mailedError.message,
    });
    return null;
  }
  const done = new Set((mailed ?? []).map((r) => r.dedupe_key as string));
  return rows.filter(
    (row) => !done.has(firstUploadClaimKey(step, row.user_id)),
  );
}
