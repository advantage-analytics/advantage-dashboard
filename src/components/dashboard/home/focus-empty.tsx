/**
 * The Focus card before there is anything to focus on.
 *
 * The card's anatomy, holding nothing: two rules where the claim's two lines
 * go, two thinner ones for the evidence run beneath it, and one line saying
 * what arrives here. It is the same substitution every other region on this
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
    <>
      {/* Two lines at the claim's own measure: a Focus claim runs to about
          30ch and wraps once, so a full-width rule over a half-width one is
          the shape it will actually take. */}
      <div className="flex flex-col gap-[9px] pt-[3px] pb-[5px]" aria-hidden="true">
        <span className="h-[9px] w-[82%] rounded-[2px] bg-[var(--ink-200)]" />
        <span className="h-[9px] w-[56%] rounded-[2px] bg-[var(--ink-200)]" />
      </div>
      {/* Thinner and lighter: the evidence run under the claim is smaller
          type, and the rules keep that relationship rather than flattening
          the card into one weight of grey. */}
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-[70%] rounded-[2px] bg-[var(--ink-100)]" />
        <span className="h-1.5 w-[44%] rounded-[2px] bg-[var(--ink-100)]" />
      </div>
      <p className="text-micro mt-0.5" style={{ maxWidth: "36ch", textWrap: "pretty" }}>
        One thing to work on, after your first match.
      </p>
    </>
  );
}
