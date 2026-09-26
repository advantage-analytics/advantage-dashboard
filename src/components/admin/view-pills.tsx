"use client";

/**
 * The 26px pill itself, as class name and inline style, so the one set of
 * visual rules can dress a `<button>` here and an `<a>` in
 * `team-section-pills.tsx` without either file restating them.
 *
 * The canvas' `.vp` rule (`TeamPage.dc.html`): 26px tall, `0 11px`, a 999px
 * radius, 12px text, a `--border-card` hairline and `--ink-600`; `.vp.on`
 * swaps in `--border-medium`, a `--surface-subtle` fill, `--ink-900` and
 * weight 500. `--border-card` and `--border-hairline` resolve to the same
 * `--ink-100` in both scopes (`colors.css`), so the hairline written here is
 * the canvas' hairline.
 *
 * Split out rather than generalizing `ViewPills` itself into something that
 * renders either element: a switcher and an in-page nav differ in more than
 * their tag — one is `aria-pressed` on a button, the other is `aria-current`
 * on a link — and a component taking a union of both props would be two
 * components wearing one name.
 */
export function viewPillProps(isActive: boolean): {
  className: string;
  style: React.CSSProperties;
} {
  return {
    className: `flex h-[26px] items-center rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200 ${
      isActive ? "" : "hover:bg-[var(--surface-subtle)]"
    }`,
    style: {
      border: `1px solid var(${isActive ? "--border-medium" : "--border-hairline"})`,
      // Only the active pill pins a background inline; rest pills leave it
      // unset so the hover class can paint the surface-subtle wash (an
      // inline `transparent` would beat the class and kill the hover).
      background: isActive ? "var(--surface-subtle)" : undefined,
      color: isActive ? "var(--ink-900)" : "var(--ink-600)",
      fontWeight: isActive ? 500 : 400,
    },
  };
}

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
            {...viewPillProps(isActive)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
