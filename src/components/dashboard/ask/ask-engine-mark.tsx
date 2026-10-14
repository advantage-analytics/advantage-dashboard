/**
 * The engine mark beside the name "Advantage Intelligence": a 16px ink-900
 * square with the 9×6 swoosh in white — the size the match report's
 * `InsightMark` draws beside small text.
 *
 * Decoration, always: on this page the engine's name is visible text next to
 * it (the composer's label), so the mark carries no name of its own. The
 * answer no longer draws it: an answer is signed by name, in its footer.
 *
 * Not `InsightMark` itself because that one draws the swoosh with
 * `next/image`, which reads `process.env` under the offline component
 * harness the composer is rendered by. The swoosh here
 * is the same file, cut out of white by a CSS mask.
 */
export function AskEngineMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--ink-900)]"
    >
      <span className="h-[6px] w-[9px] bg-white [mask:url(/logos/logo3.svg)_center/contain_no-repeat]" />
    </span>
  );
}
