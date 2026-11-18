"use client";

import { createContext, use } from "react";

/**
 * The Visualizations tab's lob keys, as `VizLobKeysProvider`
 * (`viz-lob-keys.tsx`) read them — or `null`: no provider, no file, not
 * loaded yet. `null` is "unknown", never "no lobs".
 *
 * Kept apart from the provider so `useVizFilterContext` (and the wall that
 * reads it) does not pull the report context and the ball-paths fetch into
 * every bundle that draws a card.
 */
export const VizLobKeysContext = createContext<ReadonlySet<number> | null>(
  null,
);

/** The Visualizations tab's lob keys, or `null` (see above). */
export function useVizLobKeys(): ReadonlySet<number> | null {
  return use(VizLobKeysContext);
}
