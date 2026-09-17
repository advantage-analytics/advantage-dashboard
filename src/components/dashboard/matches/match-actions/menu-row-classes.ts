/**
 * Row classes shared by the match menus (`MatchActionsMenu` and the match
 * report's ⋯ menu). They live apart from `match-actions-menu.tsx` so that a
 * menu importing them does not also pull in that menu's edit and delete
 * dialogs.
 */

/**
 * The leading glyph on each menu row, as the Roster drawer's Options menu and
 * the Schedule drawer's event menu draw it: 13px, neutral ink-400 — never
 * `--blue` (`FloatMenuItem`'s default).
 */
export const MENU_ROW_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/**
 * The destructive row rests grey like its siblings and turns `--danger` — label
 * AND icon — only on hover or keyboard focus, so red appears at the moment of
 * intent rather than standing in the menu (DS › Dropdown / Menu). The label
 * selector reaches into `FloatMenuItem`'s label span, which takes no class.
 */
export const DESTRUCTIVE_ROW =
  "group hover:[&>span:last-child>span:first-child]:text-[var(--danger)] focus-visible:[&>span:last-child>span:first-child]:text-[var(--danger)]";
export const DESTRUCTIVE_ICON =
  "group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]";
