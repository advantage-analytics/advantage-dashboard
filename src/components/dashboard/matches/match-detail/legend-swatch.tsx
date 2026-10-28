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
