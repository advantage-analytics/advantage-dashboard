"use client";

/**
 * The header's leading slot, handed to a page.
 *
 * `header-status.tsx` lets a page say one thing on the RIGHT of the bar
 * ("Draft saved"). This is the same arrangement for the LEFT: what the header
 * normally fills with a workspace title or a breadcrumb trail, a page can fill
 * itself — the player profile needs "Roster › Marcus Chen ⌄ 3 / 9" with a
 * working switcher in it (Platform Audit `Te2`), and no static route table can
 * spell a person's name.
 *
 * Null by default, so every route that never publishes renders exactly as
 * before. A node rather than a crumb spec, because the one page that needs
 * this needs a menu in the trail, and a spec would grow a field for every
 * such need. The header stays ignorant of what it is showing; the page owns
 * the words and the behaviour, the header owns the 44px bar they sit in.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface HeaderSlotValue {
  slot: React.ReactNode | null;
  setSlot: (slot: React.ReactNode | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlotValue>({
  slot: null,
  setSlot: () => {},
});

export function HeaderSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<React.ReactNode | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <HeaderSlotContext.Provider value={value}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

/** Read the published slot. For the header itself. */
export function useHeaderSlot(): React.ReactNode | null {
  return useContext(HeaderSlotContext).slot;
}

/**
 * Publish a leading slot for as long as this component is mounted.
 *
 * Clears on unmount, so navigating away cannot strand one player's name over
 * the next page. Re-publishes when the node changes — a switcher that moves
 * to the next player republishes with the new name.
 */
export function usePublishHeaderSlot(slot: React.ReactNode | null): void {
  const { setSlot } = useContext(HeaderSlotContext);
  useEffect(() => {
    setSlot(slot);
    return () => setSlot(null);
  }, [slot, setSlot]);
}
