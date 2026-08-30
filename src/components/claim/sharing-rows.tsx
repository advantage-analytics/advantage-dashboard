import { ArrowRight } from "lucide-react";

/**
 * What joining a program does to what you already have.
 *
 * Three rows, in this order, on both screens that ask someone to enter a
 * program: 4.2, where a player asks a coach to add them, and 8.2, where an
 * invited player accepts. The design's own note on 4.2 is that they are "the
 * same ones the invited player reads in 8.2, in the same order" — which is a
 * promise about consistency that only survives if there is one copy of the
 * sentences. Two files that happened to agree on the day they were written
 * would not be the same rows; they would be a coincidence waiting to end.
 *
 * The order is load-bearing and is not alphabetical or arbitrary: the first
 * row answers "does this commit me to anything" (no), the second answers "what
 * happens to my existing matches" (nothing), and only then does the third
 * offer the upside. Reassurance before benefit, because the question a player
 * actually arrives with is the first one.
 */
export const JOIN_SHARING_ROWS: readonly string[] = [
  "Your coach approves the request. Until then, this changes nothing about your account.",
  "Matches you've already uploaded stay personal. You choose, per match, whether to share one.",
  "Once you're on the roster, team matches run on the program's hours instead of your own.",
];

/**
 * The rows as the design draws them: hairline-separated, each led by a small
 * arrow rather than a tick or a bullet.
 *
 * A tick would read as a feature list and an argument for joining. These are
 * consequences — the arrow says "this follows from that", which is what they
 * are. The container carries the top rule and every row but the last carries a
 * bottom one, so the block reads as a set of facts and not as marketing.
 */
export function JoinSharingRows() {
  return (
    <div className="flex flex-col border-t border-[var(--border-hairline)]">
      {JOIN_SHARING_ROWS.map((row, index) => (
        <div
          key={row}
          className={`flex gap-2.5 py-[11px] ${
            index === JOIN_SHARING_ROWS.length - 1
              ? ""
              : "border-b border-[var(--border-hairline)]"
          }`}
        >
          <ArrowRight
            className="mt-[3px] size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-body-sm">{row}</span>
        </div>
      ))}
    </div>
  );
}
