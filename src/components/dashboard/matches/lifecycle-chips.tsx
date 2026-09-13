export type LifecycleValue = "all" | "new" | "in-progress" | "estimates";

/**
 * All · New · In progress · Estimates — the view switcher over one list.
 *
 * Status pills, not filter chips: a fixed set of 3–4 mutually exclusive views
 * of the same rows (Updated Design System 19f, applied on Matches in Platform
 * Audit Pb2). They carry no counts and no dots — the unread signal already
 * lives in the tray dot and the row's own New pill, so a third copy is noise;
 * the count lives in the page's subline instead.
 *
 * 26px pill, hairline border; the active one takes border-medium +
 * surface-subtle + ink-900 at weight 500.
 *
 * "Estimates" is the low-confidence view. No analysis state carries that
 * marker yet (Phase 2 derivation labels stats it cannot defend), so the view
 * is empty until one does — see `isEstimate` in matches-page-content.tsx.
 */
export function LifecycleChips({
  active,
  onSelect,
}: {
  active: LifecycleValue;
  onSelect: (value: LifecycleValue) => void;
}) {
  const chips: { value: LifecycleValue; label: string }[] = [
    { value: "all", label: "All" },
    { value: "new", label: "New" },
    { value: "in-progress", label: "In progress" },
    { value: "estimates", label: "Estimates" },
  ];

  return (
    <div className="flex items-center gap-2" role="group" aria-label="View">
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(chip.value)}
            className={`flex h-[26px] items-center rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200 ${
              isActive ? "" : "hover:bg-[var(--surface-subtle)]"
            }`}
            style={{
              border: `1px solid var(${isActive ? "--border-medium" : "--border-hairline"})`,
              // Only the active chip pins a background inline; rest chips leave it
              // unset so the hover class can paint the surface-subtle wash (an
              // inline `transparent` would beat the class and kill the hover —
              // the design's rest chips wash on hover, `style-hover` in Pb2).
              background: isActive ? "var(--surface-subtle)" : undefined,
              color: isActive ? "var(--ink-900)" : "var(--ink-600)",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
