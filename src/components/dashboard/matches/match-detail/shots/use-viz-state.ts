/**
 * `useVizState()` now reads the ONE shared store `VizStateProvider` mounts
 * in `shots-tab.tsx` — see `viz-state-context.tsx` for the hook itself, the
 * provider, and the doc comment explaining why a per-call-site store (this
 * file's previous contents) still let two call sites disagree with each
 * other even after each one agreed with the URL individually. Re-exported
 * from here so every existing `import { useVizState } from "./use-viz-state"`
 * across the tab's call sites keeps working unchanged.
 */
export { useVizState, useExternalSwapFadeIn } from "./viz-state-context";
