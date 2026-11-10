/**
 * The report's one legend marker: an 8px square at 2px radius, in the colour
 * of the mark it labels. Every key on the match report draws this — the chart
 * legends through `LegendSwatch`, the head to head's column header on its own.
 */
export function LegendMark({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-[2px]"
      style={{ background: color }}
    />
  );
}

/**
 * The key for a dashed line a chart draws (the performance tracker's breaks
 * of serve): the line's own stroke and dash, laid flat — upright in the 8px
 * marker slot it shows barely one dash and reads as a smudge. It is exactly
 * three dashes wide, so the key never ends on a clipped stub.
 */
export function LegendDash({
  color,
  label,
  strokeWidth,
  dash,
  gap,
}: {
  color: string;
  label: string;
  strokeWidth: number;
  /** The chart line's dash and gap lengths, in px (`strokeDasharray`). */
  dash: number;
  gap: number;
}) {
  const width = dash * 3 + gap * 2;
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        aria-hidden="true"
        width={width}
        height={8}
        viewBox={`0 0 ${width} 8`}
        className="block shrink-0"
      >
        <line
          x1={0}
          y1={4}
          x2={width}
          y2={4}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${gap}`}
        />
      </svg>
      <span className="text-micro whitespace-nowrap">{label}</span>
    </span>
  );
}

/** A color-dot-plus-label legend item, shared by the chart cards on this page. */
export function LegendSwatch({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LegendMark color={color} />
      <span className="text-micro whitespace-nowrap">{label}</span>
    </span>
  );
}
