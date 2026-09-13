"use client";

import { useCallback, useState } from "react";
import { isStoppedResult, scoreUndecided } from "./score-state";
import type { FormData as MatchFormData, Step } from "./types";

/**
 * "Did it end early?" — a score nobody has won, met at Save.
 *
 * Asked at Save rather than as the score is typed: 6-4 with an empty second
 * set is what every match looks like halfway through entry, and a question
 * that appears between sets is a nag. Once asked it stays while the score is
 * still undecided, and an answer already recorded (a SwingVision export that
 * stopped writes "Unfinished") shows as the settled line from the start.
 */
export function useScoreCheck({
  step,
  formData,
  handleCreateMatch,
}: {
  step: Step;
  formData: MatchFormData;
  handleCreateMatch: () => void;
}) {
  const [asked, setAsked] = useState(false);
  const undecided =
    step === "match" &&
    scoreUndecided({
      bestOf: parseInt(formData.bestOf, 10) || 3,
      playerScores: formData.playerScores,
      opponentScores: formData.opponentScores,
      playerTiebreaks: formData.playerTiebreaks,
      opponentTiebreaks: formData.opponentTiebreaks,
    });
  const answered = isStoppedResult(formData.result);
  const visible = undecided && (asked || answered);

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
