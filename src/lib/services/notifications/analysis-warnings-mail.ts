import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analysisWarningsInternalEmail,
  sendEmail,
  INTERNAL_ALERTS_ADDRESS,
} from "@/lib/services/email";
import type { Transcript } from "@/lib/services/splitstep/derivation";
import { claimSend } from "./should-notify";

const LOG = "[notifications:analysis-warnings]";

export interface DerivationWarning {
  title: string;
  detail: string;
}

const PLAYER1_SOURCE: Record<string, string> = {
  geometry: "court position and the wizard's top-player answer",
  distance: "whichever mapping folded closest to the entered score",
  name: "the vendor's player labels matching the match's names",
  guess: "a guess — nothing else could tell the players apart",
};

function rallyList(ids: readonly number[]): string {
  const shown = ids.slice(0, 12).join(", ");
  return ids.length > 12 ? `${shown} … (+${ids.length - 12} more)` : shown;
}

/**
 * Everything a published transcript had to guess instead of refuse, one row
 * each. Empty for a clean, reconciled match. Pure so it is testable offline.
 */
export function derivationWarnings(t: Transcript): DerivationWarning[] {
  const rec = t.reconciliation;
  const out: DerivationWarning[] = [];

  if (!rec.ok) {
    out.push({
      title: "Score not verified",
      detail: rec.reason ?? "The fold did not reproduce the entered score.",
    });
  }
  if (rec.player1Source && rec.player1Source !== "fold") {
    out.push({
      title: "Players identified without the score",
      detail: `Player 1 was named by ${PLAYER1_SOURCE[rec.player1Source] ?? rec.player1Source}. If it is wrong, every statistic is on the wrong player.`,
    });
  }
  if (t.guessedRallies.length > 0) {
    out.push({
      title: `${t.guessedRallies.length} point winner(s) guessed`,
      detail: `No readable score; the winner is the last stroke's guess. Rallies ${rallyList(t.guessedRallies)}.`,
    });
  }
  if (t.leadingUnscoredRallies.length > 0) {
    out.push({
      title: `${t.leadingUnscoredRallies.length} rally(ies) before the first score`,
      detail: `Kept as points in the opening game. Rallies ${rallyList(t.leadingUnscoredRallies)}.`,
    });
  }
  if (t.frozenRallies.length > 0) {
    out.push({
      title: `${t.frozenRallies.length} rally(ies) under a frozen score`,
      detail: `Games read from the serve rotation. Rallies ${rallyList(t.frozenRallies)}.`,
    });
  }
  return out;
}

/**
 * Mail `INTERNAL_ALERTS_ADDRESS` what a just-published match guessed.
 *
 * Silent when there is nothing to say. Keyed on the job and a fingerprint of
 * the warnings, so a webhook redelivery stays quiet while a rebuild that
 * guesses something new mails again. Never throws: the match is already
 * published and a failed notice must not read as a failed derivation.
 */
export async function notifyDerivationWarnings(params: {
  supabase: SupabaseClient;
  jobId: string;
  matchId: string;
  transcript: Transcript;
}): Promise<void> {
  const { supabase, jobId, matchId, transcript } = params;
  try {
    const warnings = derivationWarnings(transcript);
    if (warnings.length === 0) return;

    const fingerprint = createHash("sha1")
      .update(JSON.stringify(warnings))
      .digest("hex")
      .slice(0, 12);
    if (
      !(await claimSend(`analysis_warnings_internal:${jobId}:${fingerprint}`))
    )
      return;

    const { data: match } = await supabase
      .from("matches")
      .select("player1_name, player2_name")
      .eq("id", matchId)
      .maybeSingle();

    const sent = await sendEmail(
      analysisWarningsInternalEmail({
        to: INTERNAL_ALERTS_ADDRESS,
        jobId,
        matchId,
        matchTitle: match
          ? `${match.player1_name} vs. ${match.player2_name}`
          : `Match ${matchId}`,
        warnings,
      }),
    );
    if (!sent.ok) {
      console.warn(`${LOG} not delivered`, { jobId, error: sent.error });
    }
  } catch (error) {
    console.error(`${LOG} threw`, {
      jobId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
