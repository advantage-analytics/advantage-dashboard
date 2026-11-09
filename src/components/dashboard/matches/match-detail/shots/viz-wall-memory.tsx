"use client";

import { createContext, use, useMemo, useState, type ReactNode } from "react";
import type { PlayerFilter } from "./viz-model";
import type { WallCollection } from "./viz-wall";

/** What the wall showed: its player and its collection. */
export interface WallMemory {
  player: PlayerFilter;
  collection: WallCollection;
}

interface WallMemoryValue {
  memory: WallMemory | null;
  remember: (memory: WallMemory) => void;
}

const WallMemoryContext = createContext<WallMemoryValue | null>(null);

/**
 * Keeps the Visualizations wall's player and collection for the report's
 * life. "Watch these N points" leaves for the Video tab, which unmounts the
 * wall; Back mounts it again on the lightbox's URL, where `?player=` is the
 * opened card's and nothing names the collection. Without this, Back would
 * land the wall on You | Default whatever it showed before.
 *
 * Mounted by `MatchReportProvider`, which outlives every tab switch. Without
 * it (a harness mounting the tab alone) the wall keeps its own state only.
 */
export function WallMemoryProvider({ children }: { children: ReactNode }) {
  const [memory, remember] = useState<WallMemory | null>(null);
  const value = useMemo(() => ({ memory, remember }), [memory]);
  return <WallMemoryContext value={value}>{children}</WallMemoryContext>;
}

/** `null` outside a `WallMemoryProvider`. */
export function useWallMemory(): WallMemoryValue | null {
  return use(WallMemoryContext);
}
