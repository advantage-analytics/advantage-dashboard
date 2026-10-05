import { Answer, SettledNotice, WarningGlyph } from "./ImportIdentityNotice";
import { noticeEnterCls, warningStripCls } from "./styles";
import type { RetiredSide, StopReason, StoppedResult } from "./score-state";

/**
 * "Did it end early?" — asked when Save meets a score nobody has won.
 *
 * A 6-4 with nothing after it is usually someone who hasn't finished typing,
 * and sometimes a match that really stopped there. Only the person can say
 * which, so the wizard asks rather than guessing, and only once they try to
 * save — asking while they are still moving between sets would nag.
 *
 * "Yes, a player retired" asks one thing more: who. A retirement has a winner
 * and an unfinished match does not, and the score alone cannot say which side
 * stayed on court. It is the same yellow question again, not a control inside
 * the settled line — the answer is still missing, so the page still says so.
 *
 * Each "Yes" also records why play stopped (`stopReason`) — detail on the
 * answer, never the answer itself. On a dual line (`dualLine`) the first Yes is
 * "play stopped once the dual was decided": a line abandoned after the team
 * result was in is the common way a college singles score ends unwon, and it
 * records Unfinished like time or weather, but its settled line says why.
 *
 * "No, it was a one-set match" is offered (`offerOneSet`) when set 1 is the
 * only set finished and nothing is typed past it, off a line only — a preset
 * or attached line's event owns the format, a dual's most of all. It answers
 * by switching the format to best of 1, which decides the score; the settled
 * line (`oneSetWinner`) says so and keeps "Undo" rather than "Change", since
 * undoing puts the format back, not just the answer.
 *
 * The DS warning question (`primitives.md` › Warning question): stacked text
 * answers on amber, a settled answer collapses to a grey line that keeps
 * "Change". "No" isn't an answer to record — it hands focus back to the score.
 */
export function ScoreCheckNotice({
  answer,
  retiredSide,
  stopReason,
  dualLine,
  offerOneSet,
  oneSetWinner,
  onOneSet,
  onUndoOneSet,
  playerName,
  opponentName,
  onAnswer,
  onRetiredSide,
  onFinishScore,
  onChange,
}: {
  answer: StoppedResult | null;
  retiredSide: RetiredSide | undefined;
  /** Why play stopped; words the settled Unfinished line. */
  stopReason: StopReason | undefined;
  /**
   * The match is on a dual line (an event preset or attached line, never a
   * hand-picked event kind) — offers "play stopped once the dual was decided".
   */
  dualLine: boolean;
  /** Offer "No, it was a one-set match" (`offersOneSet`, and not from a line). */
  offerOneSet: boolean;
  /**
   * Who took set 1 while the one-set switch is in force — non-null means the
   * settled "Set to best of 1" line with Undo.
   */
  oneSetWinner: RetiredSide | null;
  onOneSet: () => void;
  /** Restores the previous format and reopens the question. */
  onUndoOneSet: () => void;
  playerName: string;
  opponentName: string;
  onAnswer: (result: StoppedResult, stopReason: StopReason) => void;
  onRetiredSide: (side: RetiredSide) => void;
  /** "No, I'll finish the score" — dismiss and put the cursor in the score. */
  onFinishScore: () => void;
  /** Withdraws the answer (and who retired) and asks again. */
  onChange: () => void;
}) {
  // A blank name would render " retired" — the rows still have to be tellable apart.
  const names: Record<RetiredSide, string> = {
    player: playerName.trim() || "Your player",
    opponent: opponentName.trim() || "The opponent",
  };

  // Each state is its own element type, never the same box restyled: the
  // yellow question and the grey line would otherwise morph into each other.
  if (oneSetWinner) {
    return (
      <SettledNotice
        message={`Set to best of 1 · ${names[oneSetWinner]} wins.`}
        onChange={onUndoOneSet}
        actionLabel="Undo"
      />
    );
  }

  if (answer === "Unfinished") {
    return (
      <SettledNotice
        message={
          // An import arrives Unfinished with no reason and keeps the old line.
          stopReason === "clinched"
            ? "Marked as unfinished. Play stopped once the dual was decided."
            : "Marked as unfinished. The score stays as entered."
        }
        onChange={onChange}
      />
    );
  }

  if (answer === "Retired" && retiredSide) {
    return (
      <SettledNotice
        message={`Marked as retired by ${names[retiredSide]}. The score stays as entered.`}
        onChange={onChange}
      />
    );
  }

  if (answer === "Retired") {
    return (
      <div
        key="who-retired"
        role="status"
        aria-live="polite"
        className={`${warningStripCls} pb-1.5 ${noticeEnterCls}`}
      >
        <WarningGlyph />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p>
            <b className="font-medium">Who retired?</b> The other player takes
            the win.
          </p>
          <div className="-ml-2.5 flex flex-col">
            <Answer onClick={() => onRetiredSide("opponent")}>
              {names.opponent} retired
            </Answer>
            <Answer onClick={() => onRetiredSide("player")}>
              {names.player} retired
            </Answer>
            <Answer onClick={onChange}>Go back</Answer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key="asking"
      role="status"
      aria-live="polite"
      className={`${warningStripCls} pb-1.5 ${noticeEnterCls}`}
    >
      <WarningGlyph />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p>
          <b className="font-medium">
            This score doesn&rsquo;t finish the match.
          </b>{" "}
          Did it end early?
        </p>
        <div className="-ml-2.5 flex flex-col">
          {dualLine && (
            <Answer onClick={() => onAnswer("Unfinished", "clinched")}>
              Yes, play stopped once the dual was decided
            </Answer>
          )}
          <Answer onClick={() => onAnswer("Retired", "retired")}>
            Yes, a player retired
          </Answer>
          <Answer onClick={() => onAnswer("Unfinished", "time_weather")}>
            Yes, stopped for time or weather
          </Answer>
          {offerOneSet && !dualLine && (
            <Answer onClick={onOneSet}>No, it was a one-set match</Answer>
          )}
          <Answer onClick={onFinishScore}>
            No, I&rsquo;ll finish the score
          </Answer>
        </div>
      </div>
    </div>
  );
}
