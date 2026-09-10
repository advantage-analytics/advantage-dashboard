/**
 * The hairline footer Platform Audit Pa2 gives every card on Home: a quiet
 * left-hand run saying what the card is a slice of, and a right-hand figure
 * saying how much there is of it.
 *
 * One component because the geometry is a page-level decision, not a
 * per-card one — 12px of air above the hairline, `text-micro` left, 11px
 * right, both ink-600. Three cards had copied it verbatim and had already
 * drifted apart on the margin above it.
 *
 * `text-micro` carries its own colour and is unlayered, so it beats a
 * Tailwind colour utility; the left run states ink-600 inline for that
 * reason, while the right one — which has no DS type class — uses the class.
 */
export function CardFooter({
  left,
  right,
  className = "",
}: {
  left: React.ReactNode;
  /** Omitted where the card has no count to state (the empty Focus card). */
  right?: React.ReactNode;
  /** The gap above the hairline, where the parent's own gap does not set it. */
  className?: string;
}) {
  return (
    <div
      className={`flex items-baseline gap-2.5 border-t border-[var(--border-hairline)] pt-3 ${className}`}
    >
      <span className="text-micro" style={{ color: "var(--ink-600)" }}>
        {left}
      </span>
      <div className="flex-1" />
      {right && (
        <span className="text-[11px] whitespace-nowrap text-[var(--ink-600)]">
          {right}
        </span>
      )}
    </div>
  );
}
