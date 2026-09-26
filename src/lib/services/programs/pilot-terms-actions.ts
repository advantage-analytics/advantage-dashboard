"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PILOT_TERMS_VERSION } from "./pilot-terms";

/**
 * Reading and recording a coach's pilot-terms acceptance.
 *
 * Both run through the SESSION (cookie) client, never `createAdminClient()`.
 * An acceptance is the coach's own statement, and the table's grants say so:
 * `authenticated` may insert only `{ user_id, terms_version }` for itself and
 * read only its own rows (`20260926181544_pilot_terms_acceptances.sql`). The
 * service role writing one would be us accepting on the coach's behalf.
 *
 * This check is what drives the flow today, while the RPC enforcement
 * migration is held until deploy: acceptance at the current version means
 * proceed, none means the terms screen. Once enforcement is live the database
 * refuses the same thing again (`TERMS_NOT_ACCEPTED_SQLSTATE`), and the
 * screens handle that refusal as the frame C state.
 */

export type AcceptPilotTermsResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `terms-changed`: the version the screen rendered is not the current
       * one, so the coach read words that are no longer the terms. The screen
       * re-renders the new text rather than recording the old.
       */
      reason: "terms-changed" | "no-session" | "failed";
    };

/** Whether the signed-in coach holds an acceptance at `PILOT_TERMS_VERSION`. */
export async function hasAcceptedCurrentPilotTerms(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("pilot_terms_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .eq("terms_version", PILOT_TERMS_VERSION)
    .limit(1);

  if (error) {
    // Fail towards the terms screen: a coach shown the terms once more loses
    // a click, a coach waved past them has not accepted anything.
    console.error("[pilot-terms] could not read acceptance", {
      message: error.message,
    });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Record the coach's acceptance of the version the screen rendered.
 *
 * `renderedVersion` is what the page showed, round-tripped through the form.
 * It never chooses what is written (that is always `PILOT_TERMS_VERSION`);
 * it only lets a coach who read an older text be told so instead of being
 * recorded as accepting words they never saw.
 *
 * Idempotent: an existing current-version row is enough, so a double submit
 * or a back-button revisit does not pile up acceptances.
 */
export async function recordPilotTermsAcceptance(
  renderedVersion: string,
): Promise<AcceptPilotTermsResult> {
  if (renderedVersion !== PILOT_TERMS_VERSION) {
    return { ok: false, reason: "terms-changed" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  if (await hasAcceptedCurrentPilotTerms()) return { ok: true };

  const { error } = await supabase
    .from("pilot_terms_acceptances")
    .insert({ user_id: user.id, terms_version: PILOT_TERMS_VERSION });

  if (error) {
    console.error("[pilot-terms] could not record acceptance", {
      message: error.message,
    });
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}

/**
 * The college terms screen's submit: accept, then go back through
 * `/claim/verify` to finish the claim the emailed link started.
 *
 * `token` is the signed-in link's `?token=`, carried here from the screen so
 * the claim finishes by the same path it arrived on. It is only ever put back
 * into a query string on a fixed path, never used to build a URL of its own,
 * so a crafted value can at worst finish no claim (`completeClaimWithToken`
 * checks it by hash against the session that started the claim).
 */
export async function acceptPilotTermsForClaim(input: {
  version: string;
  token?: string | null;
}): Promise<AcceptPilotTermsResult> {
  const result = await recordPilotTermsAcceptance(input?.version ?? "");
  if (!result.ok) return result;

  const token = typeof input?.token === "string" ? input.token : "";
  redirect(
    token ? `/claim/verify?${new URLSearchParams({ token })}` : "/claim/verify",
  );
}
