/**
 * Where the match drawer mounts: a flex sibling of the Matches page column.
 *
 * The drawer's state lives in `MatchesPageContent`, deep inside the page's
 * max-width column, but the rail has to sit OUTSIDE that column for the table
 * to reflow beside it (the Roster's layout). So the page draws this empty slot
 * next to the column and the content portals the drawer into it.
 */
export const MATCH_DRAWER_SLOT_ID = "matches-drawer-slot";

export function MatchDrawerSlot(): React.JSX.Element {
  return <div id={MATCH_DRAWER_SLOT_ID} className="contents" />;
}
