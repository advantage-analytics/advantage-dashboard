import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The inline action at the end of a row — "Add score", "Add video", "Report".
 *
 * One component rather than the same three classes copied into five files,
 * because all three of this element's problems were identical everywhere:
 *
 *   contrast   `--blue` is 3.68:1 on white and these are 11px, which fails
 *              WCAG 1.4.3 AA. `--blue-text` is the same family at 5.17:1.
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
}: {
  /** Given a href it renders a link; otherwise a button. */
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const style = { color: "var(--blue-text)" };

  if (href) {
    return (
      <Link href={href} className={cn(ACTION_CLS, className)} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ACTION_CLS, className)}
      style={style}
    >
      {children}
    </button>
  );
}
