import { PlayerProfileSkeleton } from "@/components/dashboard/loading/player-profile-pending";

/**
 * The player profile while its reads land (design Q): the report frame's
 * rail — the player block's bars, the real Statistics · Visualizations rows,
 * the links and New match as bars — and the pane for the view in `?tab=`,
 * its `<h1>` real and its body the same skeleton the page streams the
 * Statistics body behind. Everything sits at the height it will settle at,
 * so the page does not jump when the data arrives.
 */
export default function Loading() {
  return <PlayerProfileSkeleton />;
}
