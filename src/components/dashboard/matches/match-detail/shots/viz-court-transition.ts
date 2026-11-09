/**
 * `id` for a wall card or saved-view tile, derived from its own
 * `viewIdentityKey` (`viz-url.ts`) — `wall-card.tsx` and `court-tile.tsx`
 * set it on every card with a `navigateState`, so a card is addressable
 * (the lightbox hands focus back to whatever opened it). A leaf module, no
 * React.
 *
 * `encodeURIComponent` because a `viewIdentityKey` can contain `:` and an
 * empty segment (a viewless default tile's `viewId` half) — both valid in
 * an HTML `id`, but not worth reasoning about unescaped.
 */
export function courtTileDomId(key: string): string {
  return `viz-tile-${encodeURIComponent(key)}`;
}
