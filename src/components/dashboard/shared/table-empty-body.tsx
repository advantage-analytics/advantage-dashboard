import type { LucideIcon } from "lucide-react";

/** The one way out of an empty cut. */
export interface TableEmptyAction {
  label: string;
  onClick: () => void;
}

/**
 * The body of a list table whose pills or filters leave no rows.
 *
 * Drawn INSIDE the table card, under its column headers, rather than in place
 * of the card. A cut that returns nothing is not a different page: swapping
 * the card out for a centred line on the bare canvas made the frame jump the
 * moment a pill was pressed, and dropped the column labels that say what the
 * view would hold (Empty State → "the labels are the payload").
 *
 * Direction A2 ("Quiet") of the filtered-empty-state study. The heading NAMES
 * the cut ("No upcoming duals at home") rather than "No results", because a
 * coach who pressed two things needs to see which two emptied the table —
 * but it says so in regular ink-700, not a bold headline, since an empty view
 * is a passing state and not news. One faint page icon (the sidebar's own, so
 * it reads as "this list", not a search miss), one blue link, no sentence and
 * no second action: the All pill is already one click away.
 *
 * `min-h` is three 52px rows, so the card keeps a table's proportion. This is
 * the small-region recipe — a list reached from a populated page — never day
 * zero, which is `*-day-zero.tsx`.
 */
export function TableEmptyBody({
  icon: Icon,
  title,
  action,
}: {
  /** The page's nav icon (`Calendar`, `GalleryHorizontalEnd`). */
  icon: LucideIcon;
  /** The cut, named: "No upcoming duals at home". */
  title: string;
  action?: TableEmptyAction;
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex min-h-[156px] flex-col items-center justify-center px-6 py-7 text-center"
    >
      <Icon
        className="size-4"
        strokeWidth={1.5}
        style={{ color: "var(--ink-300)" }}
        aria-hidden="true"
      />
      <p
        className="mt-2.5 text-[13px] text-balance"
        style={{ color: "var(--ink-700)" }}
      >
        {title}
      </p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1.5 cursor-pointer text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
