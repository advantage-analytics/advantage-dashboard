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
  /**
   * Every call the flow made to its `prepare` dep — the stand-in for
   * `prepareVideoForUpload` — with the window it asked for.
   */
  prepareCalls: AttachmentFlowPrepareCall[];
  /** Every `discardPrepared` call, by storage name. */
  discardCalls: string[];
  /**
   * Resolves a `prepare=hold` cut. Before it is called the fake has reported
   * 50% progress and is waiting, so the trimming phase can be observed.
   */
  releasePrepare: () => void;
  /**
   * Resolves a `transfer=fake` upload with a published attachment. Before it
   * is called the fake has reported 1.30 GB of 3.10 GB over a faked 200 s —
   * a mid-transfer reading with a real ETA — and is waiting.
   */
  finishTransfer: () => void;
  /** The faked clock `transfer=fake` drives the flow's `now` seam with. */
  clock: number;
  /**
   * Every click on the harness's stand-in chrome link: true when the leave
   * guard took the click over and asked, false when it let it through.
   */
  guardAsks: boolean[];
  /** `router.replace` calls, from the `next/navigation` mock. */
  routerReplaces?: string[];
  routerPushes: string[];
  routerRefreshes: number;
}

export interface AttachmentFlowPrepareCall {
  filename: string;
  sizeBytes: number;
  startSeconds: number;
  endSeconds: number;
  /** What the fake resolved with, once it has. */
  result?: { trimmed: boolean; sizeBytes: number; storageName?: string };
  /** True when the flow's signal aborted the cut. */
  cancelled?: boolean;
}

export interface AttachmentFlowSavedEvent {
  id: string;
  version: number;
  confirmedVideoTimeSeconds: number;
  /** The committed offset — what two differently trimmed files differ by. */
  offsetSeconds: number;
}
