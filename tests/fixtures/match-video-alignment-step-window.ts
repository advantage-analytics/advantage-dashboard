/**
 * The seam the attachment alignment-step harness exposes to its spec.
 *
 * A plain interface rather than a `declare global`, for the same reason the
 * file step's is: the harness casts once on assignment and the spec casts once
 * inside each `page.evaluate`, so two modules never augment `Window` with the
 * same properties.
 */
export interface AlignmentHarnessWindow {
  /** Every `onAlignmentChange` call, in order. `null` means "not submittable". */
  alignmentEvents: (AlignmentHarnessEvent | null)[];
  /**
   * Make the next `play()` reject, as a browser does for autoplay policy
   * (`NotAllowedError`) or for a load that superseded the request
   * (`AbortError`). The element itself stays perfectly healthy — which is the
   * whole distinction the step has to draw.
   */
  rejectPlay: (name: "NotAllowedError" | "AbortError") => void;
  /** Restore the real `play()`. */
  restorePlay: () => void;
  /** Fire the element's own `error` event: a genuine media failure. */
  failMedia: () => void;
  /** The player's `currentTime`, for seek assertions. */
  playheadSeconds: () => number;
}

export interface AlignmentHarnessEvent {
  offsetSeconds: number;
  confirmedVideoTimeSeconds: number;
}
