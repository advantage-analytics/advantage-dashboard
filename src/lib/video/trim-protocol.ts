import type { PreparedMode, TrimSkipReason } from "./trim-plan";

/**
 * A video or audio track Mediabunny would not carry into the cut, as facts a
 * telemetry event may hold: the track kind, its codec (null when Mediabunny
 * could not name it — Apple's spatial `apac` reads that way) and Mediabunny's
 * own `DiscardedTrack` reason slug. Never a file name.
 */
export interface TrimDiscardedTrack {
  type: string;
  codec: string | null;
  reason: string;
}

/** Main thread → trim worker. */
export type TrimWorkerRequest =
  | {
      type: "start";
      file: File;
      startSeconds: number;
      endSeconds: number;
      /** OPFS file name to write the cut into. */
      outputName: string;
      /** Re-encode even where a copy was estimated to fit; see `TrimInputs`. */
      forceReencode?: boolean;
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
  | {
      type: "skip";
      reason: TrimSkipReason;
      detail?: string;
      /** Tracks the conversion would have dropped, when that is the reason. */
      discarded?: TrimDiscardedTrack[];
    }
  | { type: "cancelled" };
