"use client";

import { useSyncExternalStore } from "react";

// Nothing ever changes, so the store never notifies: the value is `false`
// during SSR and the hydration render, and `true` from the first client
// render onwards, which is exactly the one transition React itself performs.
function subscribe(): () => void {
  return () => {};
}
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * `false` on the server AND during hydration, `true` afterwards.
 *
 * The point is the second half: a `useState(false)` + `useEffect(() => set(true))`
 * flag reaches the same place, but it is the `set-state-in-effect` pattern the
 * React Compiler lint rejects in this repo, and it also renders the gated
 * subtree one commit later than necessary. `useSyncExternalStore` with a
 * `getServerSnapshot` is React's own supported way to say "these two renders
 * differ, on purpose" — it makes the server HTML and the hydration render
 * identical by construction, then re-renders.
 *
 * Use it to gate anything that CANNOT exist in server HTML: a
 * `createPortal` onto `document.body`, or a `next/dynamic(..., {ssr:false})`
 * component — that one renders `<Suspense><BailoutToCSR/></Suspense>`, and
 * `BailoutToCSR` THROWS on the server, so the server emits an empty,
 * bailed-out Suspense boundary into the HTML that the client tree never
 * reproduces (see `viz-fullscreen`'s mount site in `shots-tab.tsx`).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
