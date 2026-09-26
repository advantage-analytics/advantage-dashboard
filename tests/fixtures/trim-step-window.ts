/**
 * The seam the trim-step harness exposes to its spec.
 *
 * A plain interface rather than a `declare global`, for the same reason the
 * alignment step's is: the harness casts once on assignment and the spec casts
 * once inside each `page.evaluate`, so two modules never augment `Window` with
 * the same properties.
 */
export interface TrimHarnessWindow {
  /** Every `onTrimChange` call, in order. */
  trimEvents: TrimHarnessEvent[];
  /** The player's `currentTime`, for seek assertions. */
  playheadSeconds: () => number;
  /**
   * Park the playhead, the way a drag on the rail would.
   *
   * The step's own controls only move in ten-second jumps and single frames,
   * and the fixture clip is two seconds long — so a position strictly between
   * the two cuts is not reachable by pressing anything. This writes
   * `currentTime` on the step's own element and is the one thing the spec
   * drives that a user would drive with the pointer.
   */
  seekTo: (seconds: number) => void;
}

export interface TrimHarnessEvent {
  startSeconds: number;
  endSeconds: number;
}
