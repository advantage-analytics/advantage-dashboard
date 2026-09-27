/**
 * The seam the attachment file-step harness exposes to its spec.
 *
 * Declared as a plain interface rather than a `declare global` so the harness
 * and the spec can both name it without two modules augmenting `Window` with
 * the same properties — the harness casts once on assignment, the spec casts
 * once inside each `page.evaluate`.
 */
export interface FileStepHarnessWindow {
  /** Fixture bytes, fetched once before React mounts. */
  fixtures: Record<string, ArrayBuffer>;
  /**
   * Every `onSelectionChange` call, in order. A `null` is the "whatever was
   * selected is no longer selected, so any alignment is void" notification.
   */
  selectionEvents: (FileStepSelectionEvent | null)[];
  /** The hook's programmatic entry point. */
  selectFile: (file: File | null) => void;
  /** Build a `File` from a prefetched fixture, with no network access. */
  fileFrom: (fixture: string, name: string) => File;
  /** Clicks observed on the hidden file input, for the keyboard checks. */
  inputClicks?: number;
  /**
   * `confirmPlayableLocally`, reachable directly.
   *
   * The decoded-frame/seek gate cannot be reached through the hook with any
   * owned fixture — everything this build ships parses AND plays in Chromium,
   * which is the point of shipping them. Exposing the check lets a spec hand
   * it bytes no decoder will take, which is the case it exists for.
   */
  confirmPlayable: (blob: Blob) => Promise<{ ok: boolean; detail: string }>;
}

export interface FileStepSelectionEvent {
  filename: string;
  contentType: string;
  durationSeconds: number;
}
