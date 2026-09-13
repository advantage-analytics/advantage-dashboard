"use client";

import { useCallback, useState } from "react";
import type { ProviderId } from "@/lib/services/upload";
import {
  asksIfEndedEarly,
  isStoppedResult,
  scoreCheckAnswered,
  scoreGames,
  scoreUndecided,
} from "./score-state";
import type { FormData as MatchFormData, Step } from "./types";

/**
 * "Did it end early?" — a score nobody has won, met at Save.
 *
 * Asked at Save rather than as the score is typed: 6-4 with an empty second
 * set is what every match looks like halfway through entry, and a question
 * that appears between sets is a nag. Once asked it stays while the score is
 * still undecided, and an answer already recorded (a SwingVision export that
 * stopped writes "Unfinished") shows as the settled line from the start.
 *
 * A SwingVision import is never asked and never held (`asksIfEndedEarly`):
 * its "Unfinished" line still shows, but Save goes straight through.
 */
export function useScoreCheck({
  step,
  formData,
  provider,
  handleCreateMatch,
}: {
  step: Step;
  formData: MatchFormData;
  provider: ProviderId | null;
  handleCreateMatch: () => void;
}) {
  const [asked, setAsked] = useState(false);
  const undecided = step === "match" && scoreUndecided(scoreGames(formData));
  // `started` keeps the notice up while Retired waits for "who retired?";
  // only a complete answer lets Save through.
  const started = isStoppedResult(formData.result);
  const answered = !asksIfEndedEarly(provider) || scoreCheckAnswered(formData);
  const visible = undecided && (asked || started);

  const dismiss = useCallback(() => setAsked(false), []);

  /** Save match: reveals the question instead of saving while it is unanswered. */
  const saveMatch = useCallback(() => {
    if (undecided && !answered) {
      setAsked(true);
      return;
    }
    handleCreateMatch();
  }, [undecided, answered, handleCreateMatch]);

  return {
    visible,
    /** On screen and still waiting — one more unanswered field for the gate. */
    unanswered: visible && !answered,
    dismiss,
    saveMatch,
  };
}
