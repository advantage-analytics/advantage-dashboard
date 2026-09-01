/**
 * The rail's "Match data" block (artboard 46c, lines 799–811) — the
 * redesigned home of `DerivedStatsNotice`'s content, for matches whose
 * statistics were derived from video (`match.sourceProvider === "splitstep"`)
 * rather than hand-scored or imported from a SwingVision export.
 *
 * Only two of the artboard's three caveat lines are real. Both come straight
 * from `derived-stats-notice.tsx`, which this block supersedes: an ace and a
 * service winner are the same event to the model (the returner never touches
 * the ball either way, and nothing distinguishes an unreturnable serve from
 * one the returner chose not to chase), and "Errors" is model output that
 * counts forced and unforced together, so it reads higher than a hand-tagged
 * match would.
 *
 * The artboard's third line — "Two games have no point data" — is
 * fabricated. There is no per-game completeness count today: `points.flags`/
 * `shots.flags` (migration `20260818000000_derived_row_flags.sql`) mark
 * data-quality contradictions on rows that exist, not games with zero rows,
 * and `getMatchPointsFromSupabase` doesn't select `flags` at all yet — so
 * it's dropped rather than shipped as a guess (see
 * `docs/match-detail-v46-flags.md` #5). The summary sentence above the list
 * says "Two" rather than the artboard's "Three" so the count always matches
 * what actually renders below it.
 *
 * "Review flags" has nowhere to go — there is no data-correction page — so
 * it renders as a genuinely disabled `<button>` with a caption saying so,
 * rather than a live link that goes nowhere.
 */
export function MatchDataBlock() {
  return (
    <section
      aria-label="Match data"
      className="flex flex-col gap-2.5 border-t border-[var(--border-hairline)] pt-5"
    >
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Match data</span>
        <div className="flex-1" />
        <span
          className="inline-flex h-[18px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-[7px] text-[10px] font-medium"
          style={{ color: "var(--ink-700)" }}
        >
          Coming soon
        </span>
      </div>

      <span
        className="text-[13px] leading-[1.5]"
        style={{ color: "var(--ink-900)" }}
      >
        Two statistics on this match need a human.
      </span>

      <div className="flex flex-col gap-1.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-[10px]">
        <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
          Aces can&apos;t be told from service winners
        </span>
        <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
          &ldquo;Errors&rdquo; counts forced and unforced together
        </span>
      </div>

      <div className="mt-0.5 flex flex-col gap-1.5">
        <button
          type="button"
          disabled
          className="flex h-[34px] cursor-not-allowed items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[12px] font-medium disabled:opacity-100"
          style={{ color: "var(--ink-500)" }}
        >
          Review flags
        </button>
        <span className="text-micro">
          Opens the data-correction page, once it exists
        </span>
      </div>
    </section>
  );
}
