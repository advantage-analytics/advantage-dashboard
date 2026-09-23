/**
 * Stand-ins for two of `match-drawer.tsx`'s imports, for a browser harness
 * that only needs its `PeekDrawerFrame`.
 *
 * - `MatchActionsMenu` — the real menu's edit dialog reaches server actions
 *   that pull `next/cache` and `node:stream` into the bundle.
 * - `next/image` (the default export) — reads `process.env` at module load,
 *   which a plain webpack bundle never defines.
 *
 * Alias both specifiers to this file.
 */
export function MatchActionsMenu(): null {
  return null;
}

export default function Image(
  props: React.ImgHTMLAttributes<HTMLImageElement>,
): React.JSX.Element {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
