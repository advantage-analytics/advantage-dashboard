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

/**
 * The only blue-tinted pill. "You" shared this style until 2026-09-13, when it
 * went grey (`YouPill`); a second blue pill costs this one its meaning, so do
 * not add one.
 */
export function NewPill({ className }: { className?: string }) {
  return (
    <span className={cn(BLUE_PILL_CLASS, className)} style={BLUE_PILL_STYLE}>
      New
    </span>
  );
}
