"use client";

/**
 * A fixed-set view switcher over one list, generalized from
 * `LifecycleChips` (`src/components/dashboard/matches/lifecycle-chips.tsx`,
 * the Matches "All · New · In progress · Estimates" row).
 *
 * Status pills, not filter chips: a small number of mutually exclusive views
 * of the same rows. They carry no counts and no dots — a count belongs in
 * the page's subline, not on the pill.
 *
 * 26px pill, hairline border; the active one takes border-medium +
 * surface-subtle + ink-900 at weight 500.
 */
export function ViewPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="View">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`flex h-[26px] items-center rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200 ${
              isActive ? "" : "hover:bg-[var(--surface-subtle)]"
            }`}
            style={{
              border: `1px solid var(${isActive ? "--border-medium" : "--border-hairline"})`,
              // Only the active pill pins a background inline; rest pills
              // leave it unset so the hover class can paint the
              // surface-subtle wash (an inline `transparent` would beat the
              // class and kill the hover).
              background: isActive ? "var(--surface-subtle)" : undefined,
              color: isActive ? "var(--ink-900)" : "var(--ink-600)",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
