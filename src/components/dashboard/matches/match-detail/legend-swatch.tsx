/** A color-dot-plus-label legend item, shared by the chart cards on this page. */
export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: color }}
      />
      <span className="text-micro whitespace-nowrap">{label}</span>
    </span>
  );
}
