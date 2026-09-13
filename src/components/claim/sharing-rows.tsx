import { ArrowRight } from "lucide-react";

/**
 * What joining a program does to what you already have.
 *
 * Three rows, in this order, on 4.2 — where a player asks a coach to add them.
 *
 * ── The 8.2 caption, and why these rows are not on it ───────────────────────
 * The design's note on 4.2 says they are "the same ones the invited player
 * reads in 8.2, in the same order", and building 8.2 is what established that
 * the note describes an intention rather than the frames. 8.2 draws six rows in
 * two headed columns — "Your coaches will see" and "Stays yours" — and shares
 * no sentence with these three. Sharing a constant between the two would mean
 * making one screen wrong to keep a caption right, so 8.2 carries its own copy
 * in `components/join/join-terms.tsx`, which explains the split from its end.
 *
 * That is not a licence to let the two drift on meaning. They answer the same
 * question at two different moments — asking, and accepting — and a change to
 * what this product does with a player's matches has to land in both files.
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
