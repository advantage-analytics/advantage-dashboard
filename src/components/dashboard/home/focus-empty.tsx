/**
 * The Focus card before there is anything to focus on.
 *
 * The card's anatomy, holding nothing: a rule where the claim's line goes,
 * three thinner ones for the evidence run beneath it, and — in the footer
 * slot `FocusCard` draws — one line saying what arrives here. It is the same substitution every other region on this
 * page makes — the KPI tile's rule on the value's baseline, the ghost match
 * rows — so the column reads as one set of cards waiting rather than three
 * waiting and one already speaking.
 *
 * An earlier version put a real example claim here, quoted and labelled, to
 * show what a finding looks like. It demonstrated more, but it made this the
 * only card in the column carrying finished prose, and the largest prose in
 * the tail at that. The demonstration was not worth the card sitting apart
 * from its neighbours.
 *
 * Nothing here is invented — no sentence, no figure, nothing a screen reader
 * could read out as a finding. The graded tail is `inert`, and the accessible
 * account of what fills this page lives in `DayZeroHome`.
 */
export function FocusEmpty() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {/* One line at the claim's own measure: a 14px claim on the 400px rail
          runs to about 30ch and seldom wraps, so one rule is the shape it
          takes. 8px tall — the x-height of 14px type, not its line box. */}
      <div className="flex flex-col pt-[5px] pb-[5px]">
        <span className="h-2 w-[72%] rounded-[2px] bg-[var(--ink-200)]" />
      </div>
      {/* Thinner and lighter: the evidence run under the claim is smaller
          type on a 1.7 line, and the rules keep that relationship rather than
          flattening the card into one weight of grey. */}
      <div className="flex flex-col gap-2 pb-0.5">
        <span className="h-1.5 w-full rounded-[2px] bg-[var(--ink-100)]" />
        <span className="h-1.5 w-[86%] rounded-[2px] bg-[var(--ink-100)]" />
        <span className="h-1.5 w-[44%] rounded-[2px] bg-[var(--ink-100)]" />
      </div>
    </div>
  );
}
