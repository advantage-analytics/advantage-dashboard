import { UserRoundCog } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";

/**
 * Coach-managed — a roster profile with no login, whose matches staff
 * upload. One glyph everywhere the state is shown (design owner's pick over
 * the grey pill, 2026-11-10): `UserRoundCog`, ink-400, straight after the
 * name. `Shield` (the guardian choice in the claim flow) and `Lock`
 * (private) were ruled out because the app already uses them.
 *
 * `CoachManagedMark` is the named, focusable glyph with its dark tooltip —
 * the label is the state, the detail what it means. It is focusable so the
 * tooltip opens from the keyboard, and `ChromeTooltip` opens it on
 * press-and-hold on a touch screen. Where a tooltip cannot work — a menu
 * row, whose hover means "choose" — the host draws `CoachManagedGlyph`
 * (silent) and says "Coach-managed" in words beside it instead.
 *
 * A name truncates before the glyph does: hosts put it `shrink-0` after the
 * name, like the Matches list's unread dot.
 */
export function CoachManagedMark({
  side = "bottom",
  align = "start",
  size = 14,
  focusable = true,
  className,
}: {
  /**
   * Where the tooltip opens. Below by default: an identity block sits under
   * a 44px header whose ‹ › and ✕ a tooltip above would cover.
   */
  side?: "top" | "bottom";
  /** Which tooltip edge lines up with the glyph — toward the host's room. */
  align?: "start" | "end";
  size?: 12 | 14;
  /**
   * False inside a host that is itself a tab stop (a roster row opens its
   * drawer from the keyboard): the glyph then names itself to a reader but
   * adds no second stop per row, and its tooltip stays a pointer aid.
   */
  focusable?: boolean;
  className?: string;
}) {
  return (
    <ChromeTooltip
      label="Coach-managed"
      detail="No login yet · Staff upload their matches"
      side={side}
      align={align}
      sideOffset={6}
    >
      <span
        role="img"
        aria-label="Coach-managed"
        tabIndex={focusable ? 0 : undefined}
        className={cn(
          "inline-flex shrink-0 cursor-default rounded-[var(--radius-cell)] align-[-1px] text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-600)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area",
          className,
        )}
      >
        <UserRoundCog
          className={size === 12 ? "size-3" : "size-3.5"}
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
    </ChromeTooltip>
  );
}

/** The same glyph, silent: for a host that says "Coach-managed" in words. */
export function CoachManagedGlyph({
  size = 12,
  className,
}: {
  size?: 12 | 14;
  className?: string;
}) {
  return (
    <UserRoundCog
      className={cn(
        "shrink-0 text-[var(--ink-400)]",
        size === 12 ? "size-3" : "size-3.5",
        className,
      )}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
