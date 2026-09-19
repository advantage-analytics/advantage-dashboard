/**
 * The seam the attachment flow harness exposes to its spec.
 *
 * A plain interface rather than a `declare global`, matching the file and
 * alignment harnesses: the harness casts once on assignment and the spec casts
 * once inside each `page.evaluate`, so two modules never augment `Window` with
 * the same properties.
 */
export interface AttachmentFlowHarnessWindow {
  /**
   * Every `onSaved` call, in order.
   *
   * The ORDER is the assertion that matters: a caller navigates on this, so an
   * entry appearing before the completion response would be a person told their
   * video was saved while it was still in flight.
   */
  savedEvents: AttachmentFlowSavedEvent[];
  /** Unmount the React root — the "left the page mid-upload" case. */
  unmount: () => void;
}

export interface AttachmentFlowSavedEvent {
  id: string;
  version: number;
  confirmedVideoTimeSeconds: number;
}
