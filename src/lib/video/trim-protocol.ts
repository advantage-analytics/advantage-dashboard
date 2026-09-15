import type { TrimSkipReason } from "./trim-plan";

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
  | { type: "progress"; progress: number }
  | { type: "done"; outputName: string; durationSeconds: number }
  | { type: "skip"; reason: TrimSkipReason; detail?: string }
  | { type: "cancelled" };
