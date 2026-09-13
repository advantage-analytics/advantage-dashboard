import { Answer, SettledNotice, WarningGlyph } from "./ImportIdentityNotice";
import { noticeEnterCls, warningStripCls } from "./styles";
import type { StoppedResult } from "./score-state";

const SETTLED: Record<StoppedResult, string> = {
  Retired: "Marked as retired.",
  Unfinished: "Marked as unfinished.",
};

/**
 * "Did it end early?" — asked when Save meets a score nobody has won.
 *
 * A 6-4 with nothing after it is usually someone who hasn't finished typing,
 * and sometimes a match that really stopped there. Only the person can say
 * which, so the wizard asks rather than guessing, and only once they try to
 * save — asking while they are still moving between sets would nag.
 *
 * The DS warning question (`primitives.md` › Warning question): stacked text
 * answers on amber, a settled answer collapses to a grey line that keeps
 * "Change". "No" isn't an answer to record — it hands focus back to the score.
 */
export function ScoreCheckNotice({
  answer,
  onAnswer,
  onFinishScore,
  onChange,
}: {
  answer: StoppedResult | null;
  onAnswer: (result: StoppedResult) => void;
  /** "No, I'll finish the score" — dismiss and put the cursor in the score. */
  onFinishScore: () => void;
  /** Withdraws the answer and asks again. */
  onChange: () => void;
}) {
  // Each state is its own element type, never the same box restyled: the
  // yellow question and the grey line would otherwise morph into each other.
  if (answer) {
    return (
      <SettledNotice
        message={`${SETTLED[answer]} The score stays as entered.`}
        onChange={onChange}
      />
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
          <Answer onClick={() => onAnswer("Retired")}>
            Yes, a player retired
          </Answer>
          <Answer onClick={() => onAnswer("Unfinished")}>
            Yes, it wasn&rsquo;t finished (time, weather)
          </Answer>
          <Answer onClick={onFinishScore}>
            No, I&rsquo;ll finish the score
          </Answer>
        </div>
      </div>
    </div>
  );
}
