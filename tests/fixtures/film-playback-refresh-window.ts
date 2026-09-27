/**
 * The seam the film playback-refresh harness exposes to its spec.
 *
 * Deliberately tiny: everything else the spec asserts is read off the DOM the
 * two players actually render, because the claim under test is about what a
 * viewer sees — which URL is playing, where the playhead is, which row is lit
 * — and a harness that reported those itself would be marking its own work.
 */
export interface FilmRefreshHarnessWindow {
  /** Unmount the React root — the "closed the tab mid-refresh" case. */
  unmount: () => void;
  /**
   * Unmount and immediately remount the `FilmTab` subtree, leaving the
   * providers above it mounted — the view switch (`MatchReportWhen` renders
   * null for an inactive view, so the Video view really is destroyed and
   * rebuilt when the viewer visits Statistics and comes back).
   */
  remountFilmTab: () => void;
  /**
   * Hand the (still mounted) provider a fresh points array — the fixture with
   * the given points' saved flags overridden — the way `router.refresh()`
   * re-renders the match layout after a video lands or an analysis re-runs.
   */
  reseedPoints: (saved: Record<string, boolean>) => void;
}
