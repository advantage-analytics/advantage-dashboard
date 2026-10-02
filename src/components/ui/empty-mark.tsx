/**
 * The not-yet value in a table cell: one em dash, one size, at the same x as
 * the column's real values (Data Table law 1).
 *
 * "One mark, one size" is the load-bearing half of the rule. Record, Form and
 * Last match each used to invent their own absence — a 13px dash, a 12px dash,
 * a whole sentence — so a player with no matches read as three unrelated gaps
 * instead of one. That is what this component fixes, and it is why it is
 * shared rather than private to a table.
 *
 * It does NOT center the mark under its heading. That was tried: the mark was
 * laid over an invisible copy of the heading string and centred on it, so the
 * width matched the heading by construction. But a heading's width has nothing
 * to do with where its column's values sit, so the dash landed 21px right of
 * Record's numbers, 13px right of Form's ticks and 36px right of Last match —
 * three different drifts on one row, none of them aligned to anything. The
 * column is read down far more often than a row of empties is read across, and
 * a column has exactly one x-origin. So the mark simply inherits its cell's
 * alignment: flush left in a text column, flush right in a numeric one, always
 * on the same x as the values above and below it.
 *
 * `label` is the absence in words, kept `sr-only` — a dash reads as nothing to
 * assistive technology.
 */
export function EmptyMark({
  label,
  className,
}: {
  /** What is missing, e.g. "No record yet". Omit only when the cell says it. */
  label?: string;
  className?: string;
}) {
  return (
    <>
      <span
        aria-hidden
        className={
          className
            ? `text-[13px] leading-none text-[var(--ink-400)] ${className}`
            : "text-[13px] leading-none text-[var(--ink-400)]"
        }
      >
        —
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
