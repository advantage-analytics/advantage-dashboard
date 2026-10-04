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
 *
 * "No, it was a one-set match" (`chooseOneSet`) answers by changing the
 * format, not by recording a result: it switches to best of 1, which decides
 * the score, so the question would vanish with it. The hook remembers the
 * format it switched from and keeps the notice up as a settled line with
 * "Undo" (`oneSetSettled`) until Undo, or until Format is changed by hand.
 */
export function useScoreCheck({
  step,
  formData,
  provider,
  handleCreateMatch,
  handleFormatChange,
}: {
  step: Step;
  formData: MatchFormData;
  provider: ProviderId | null;
  handleCreateMatch: () => void;
  handleFormatChange: (bestOf: string) => void;
}) {
  const [asked, setAsked] = useState(false);
  // The format "one-set match" switched away from; null when it isn't in force.
  const [oneSetFrom, setOneSetFrom] = useState<string | null>(null);
  // Format changed by hand since: the switch is no longer this line's to undo.
  // Adjusted during render, not in an effect, so no frame shows a stale line.
  if (oneSetFrom !== null && formData.bestOf !== "1") setOneSetFrom(null);

  const undecided = step === "match" && scoreUndecided(scoreGames(formData));
  // `started` keeps the notice up while Retired waits for "who retired?";
  // only a complete answer lets Save through.
  const started = isStoppedResult(formData.result);
  const answered = !asksIfEndedEarly(provider) || scoreCheckAnswered(formData);
  // Undecided again at best of 1 (set 1 edited after the switch) is the plain
  // question once more — `asked` is still true from when it was answered.
  const oneSetSettled =
    step === "match" &&
    oneSetFrom !== null &&
    formData.bestOf === "1" &&
    !undecided;
  const visible = (undecided && (asked || started)) || oneSetSettled;

  const dismiss = useCallback(() => setAsked(false), []);

  /** "No, it was a one-set match" — the caller clears the stopped answer. */
  const chooseOneSet = useCallback(() => {
    setOneSetFrom(formData.bestOf);
    handleFormatChange("1");
  }, [formData.bestOf, handleFormatChange]);

  /** Back to the format it was, with the question open as before the switch. */
  const undoOneSet = useCallback(() => {
    if (oneSetFrom === null) return;
    handleFormatChange(oneSetFrom);
    setOneSetFrom(null);
    setAsked(true);
  }, [oneSetFrom, handleFormatChange]);

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
    /**
     * On screen and still waiting — one more unanswered field for the gate.
     * The one-set line is settled: best of 1 decided the score.
     */
    unanswered: visible && undecided && !answered,
    oneSetSettled,
    chooseOneSet,
    undoOneSet,
    dismiss,
    saveMatch,
  };
}
