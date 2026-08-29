export type LifecycleValue = "all" | "new" | "in-progress";

/**
 * All · New · In progress — with counts baked into the chip itself, the one
 * place a count lives outside a tooltip (v3's Data Table law 7: this is page
 * content, not chrome). "Estimates" isn't included — there's no low-confidence
 * signal in the data yet to back it honestly.
 */
export function LifecycleChips({
  active,
  counts,
  onSelect,
}: {
  active: LifecycleValue;
  counts: { all: number; new: number; inProgress: number };
  onSelect: (value: LifecycleValue) => void;
}) {
  const chips: { value: LifecycleValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "new", label: "New", count: counts.new },
    { value: "in-progress", label: "In progress", count: counts.inProgress },
  ];

  return (
    <div className="flex items-center gap-2">
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(chip.value)}
            className="flex h-[26px] items-center rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200"
            style={{
              border: `1px solid var(${isActive ? "--border-medium" : "--border-hairline"})`,
              background: isActive ? "var(--surface-subtle)" : "transparent",
              color: isActive ? "var(--ink-900)" : "var(--ink-600)",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {chip.label} <span className="tabular ml-1">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}
