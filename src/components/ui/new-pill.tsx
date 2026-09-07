import { cn } from "@/lib/utils";

/**
 * The "New" row marker — an unread report, named beside the row's primary name.
 *
 * Not a `StatePill`. Grey pills are the neutral-status register (Draft,
 * Invited, Inactive); "new" is emphasis, and blue is the one voice the system
 * has for it (Updated Design System 19f, applied on Matches in Platform Audit
 * Pb2). Blue text on a 10% blue tint — never filled blue, which would compete
 * with the Result badge in the same row. 18px pill, 10/500, no icon.
 *
 * The tint is mixed from `--blue` rather than baked as an rgba so it follows
 * the token into the dark scope; `--blue-tint-08` and `-12` bracket it but the
 * frame draws 10%.
 */
const BLUE_PILL_CLASS =
  "inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-[7px] text-[10px] font-medium";

const BLUE_PILL_STYLE = {
  background: "color-mix(in oklch, var(--blue) 10%, transparent)",
  color: "var(--blue)",
} as const;

export function NewPill({ className }: { className?: string }) {
  return (
    <span className={cn(BLUE_PILL_CLASS, className)} style={BLUE_PILL_STYLE}>
      New
    </span>
  );
}

/**
 * The viewer's own row, marked — "You" beside the name on a members list.
 *
 * The second, and last, blue-tinted pill (Settings Pages, design owner's call
 * 2026-09-06). It lives in this file rather than its own so the cap is
 * legible: the two share one class and one style, and a third would have to
 * be added here, in view of the rule that says not to. Identity, not standing
 * — it sits beside the name, and the role stays in the grey pill column.
 */
export function YouPill({ className }: { className?: string }) {
  return (
    <span className={cn(BLUE_PILL_CLASS, className)} style={BLUE_PILL_STYLE}>
      You
    </span>
  );
}
