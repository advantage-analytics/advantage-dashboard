/**
 * One row of a header menu — the profile menu's links and the workspace
 * switcher's options, which stack inside the same popover and must share a
 * measure. Two copies of this string once disagreed by 1px on the gutter and
 * the rows stepped out of line; now there is one.
 *
 * 9px vertical rhythm, 9px radius: the 288px menu's measure. The 260px one
 * ran 7px/8px and read as packed once it had the room not to be.
 */
export const MENU_ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[9px] px-3 py-[9px] text-[12px] text-[var(--ink-900)] transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none cursor-pointer";

/**
 * A workspace mark at menu-row scale: 18px, the text's own line height, so a
 * row holding one stays the height the menu's scroll cap was measured against.
 * Settings › Profile previews the personal mark with the same string, so the
 * preview is the icon the list really draws.
 */
export const MENU_MARK_CLASS =
  "size-[18px] rounded-[var(--radius-cell)] text-[9px]";

/** A hairline that runs edge to edge inside the menu's 8px padding. */
export const MENU_RULE_CLASS = "-mx-2 h-px bg-[var(--border-hairline)]";
