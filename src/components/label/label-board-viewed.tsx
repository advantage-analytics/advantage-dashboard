"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import type { LabelBoardViewedProperties } from "@/lib/services/labels/board-viewed";

/**
 * `/label`'s analytics, and nothing on screen: one `label_board_viewed` per
 * page load, with how many jobs the board offered. The counts are worked out
 * on the server (`labelBoardViewedProperties`), so only numbers and flags
 * reach the browser for this. Once per mount — a `router.refresh()` after a
 * claim re-renders the page without counting another view.
 */
export function LabelBoardViewed({
  properties,
}: {
  properties: LabelBoardViewedProperties;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("label_board_viewed", properties);
  }, [properties]);
  return null;
}
