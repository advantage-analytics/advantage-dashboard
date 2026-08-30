import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The inline action at the end of a row — "Add score", "Add video", "Report".
 *
 * One component rather than the same classes copied into five files, because
 * this element's problems were identical everywhere:
 *
 *   colour     Signal Blue (`--blue`), so a row action reads as the same accent
 *              as every other link on the page. It once used the darker
 *              `--blue-text` (#2563EB) for contrast — `--blue` is 3.68:1 on
 *              white, under WCAG 1.4.3 AA for 11px text — but that darker blue
 *              read as a second, off tone beside the regular blue everywhere
 *              else, so the design owner reverted it to `--blue`. If AA on these
 *              11px links matters, raise their size rather than resplitting the
 *              accent.
 *   focus      the app's reset leaves `outline: none` and nothing replaced it,
 *              so a keyboard user tabbing a dual saw no indicator at all on the
 *              only interactive element in each row (WCAG 2.4.7).
 *   hit area   17px tall against WCAG 2.2's 24px floor. The expansion is a
 *              pseudo-element, not padding, so rows keep their density — the
 *              target grows, the layout does not move.
 */
const ACTION_CLS = cn(
  "relative inline-flex cursor-pointer items-center rounded-[4px]",
  "text-[11px] font-medium leading-none",
  "outline-none transition-colors duration-[var(--duration-hover)]",
  "focus-visible:shadow-[var(--focus-ring)]",
  // Invisible target centred on the label. The label itself renders 11px tall
  // (leading-none at 11px), so 7px each side clears WCAG 2.2 SC 2.5.8's 24px
  // floor with a pixel to spare — 6px measured 23px and missed it.
  "before:absolute before:-inset-x-2 before:-inset-y-[7px] before:content-['']"
);

export function RowAction({
  href,
  onClick,
  children,
  className,
  ariaLabel,
}: {
  /** Given a href it renders a link; otherwise a button. */
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  /**
   * Overrides the accessible name where the visible label repeats down a list
   * and only its row says which one it means — "View profile" against six of
   * them. Sighted users have the row for context; a screen reader reading the
   * link list has only this.
   */
  ariaLabel?: string;
}) {
  const style = { color: "var(--blue)" };

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(ACTION_CLS, className)}
        style={style}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(ACTION_CLS, className)}
      style={style}
    >
      {children}
    </button>
  );
}
