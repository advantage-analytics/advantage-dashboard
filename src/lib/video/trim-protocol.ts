import type { PreparedMode, TrimSkipReason } from "./trim-plan";

/** Main thread → trim worker. */
export type TrimWorkerRequest =
  | {
      type: "start";
      file: File;
      startSeconds: number;
      endSeconds: number;
      /** OPFS file name to write the cut into. */
      outputName: string;
    }
  | { type: "cancel" };

/** Trim worker → main thread. */
export type TrimWorkerResponse =
  /** Sent once, before the first progress, when the file will be written. */
  | { type: "mode"; mode: PreparedMode }
  | { type: "progress"; progress: number }
  | {
      type: "done";
      outputName: string;
      durationSeconds: number;
      mode: PreparedMode;
    }
  | { type: "skip"; reason: TrimSkipReason; detail?: string }
  | { type: "cancelled" };
