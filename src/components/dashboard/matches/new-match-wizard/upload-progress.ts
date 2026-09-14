import type { ScoreLineSet } from "@/lib/ui/score-format";
import type {
  VideoUploadEvent,
  VideoUploadProgress,
} from "./useUploadMatchWizard";

/**
 * What the success screen says about the match it just saved.
 *
 * Handed over by the wizard at the moment the row is written, from the same
 * values it wrote — the screen never re-reads the match, so it cannot show a
 * name or score the row does not have.
 */
export interface CreatedMatch {
  matchId: string;
  playerName: string;
  opponentName: string;
  /** Played sets only, oriented to `playerName`. */
  sets: ScoreLineSet[];
  /** Null when the score decides nobody — a stopped or unfinished match. */
  won: boolean | null;
  /**
   * What still runs after the row is in: a video transfer from this tab, an
   * import's file being read, or nothing (a video job saved without a file).
   */
  follows: "video" | "import" | "none";
}

/**
 * What one upload is doing, owned by `UploadMatchFlow` rather than the wizard
 * hook.
 *
 * The wizard unmounts the instant a match is created, but its upload closure
 * runs for up to a couple of hours afterwards. The flow survives that, so it is
 * the only place the progress can live.
 */
export interface UploadState {
  matchId: string;
  /**
   * `done` means the bytes landed; `submitted` means the vendor took the job.
   * `submit_failed` is deliberately separate from `failed` — the video is
   * stored and the row still says `uploaded`, so it is retryable without
   * re-uploading anything.
   */
  phase:
    | "uploading"
    | "done"
    | "submitted"
    | "submit_failed"
    | "cancelled"
    | "failed";
  fileName: string;
  /** From `"started"`; what "Try again" resubmits. Absent before it lands. */
  jobId?: string;
  progress?: VideoUploadProgress;
  error?: string;
  cancel?: () => void;
}

export type UploadPhase = UploadState["phase"];

/**
 * Folds one event from the wizard's upload closure into the uploads map.
 *
 * Keyed by match, because uploads genuinely overlap: "Upload another" starts a
 * second transfer while the first is still moving bytes. A single slot meant
 * the second silently replaced the first on screen while both ran, and Cancel
 * only ever reached the newest one.
 *
 * Returns `prev` itself for an event it ignores, so a `setState` updater that
 * calls this does not re-render.
 */
export function applyVideoUploadEvent(
  prev: Map<string, UploadState>,
  event: VideoUploadEvent,
): Map<string, UploadState> {
  if (event.kind === "started") {
    return new Map(prev).set(event.matchId, {
      matchId: event.matchId,
      phase: "uploading",
      fileName: event.fileName,
      jobId: event.jobId,
      cancel: event.cancel,
    });
  }

  const current = prev.get(event.matchId);
  if (!current) {
    // A failure can land before `"started"` ever does: the upload-url call
    // was refused, the session expired, the file's container was rejected.
    // Dropped, it left the success card with nothing to show and falling
    // through to "Sent for analysis." for a video that never moved a byte.
    // `"started"` is what carries the file name, so this entry has none.
    if (event.kind !== "failed") {
      // Every other kind follows a `"started"` and cannot arrive first.
      return prev;
    }
    return new Map(prev).set(event.matchId, {
      matchId: event.matchId,
      phase: "failed",
      fileName: "Video",
      error: event.error,
    });
  }

  const patch: Partial<UploadState> =
    event.kind === "progress"
      ? { progress: event.progress }
      : event.kind === "failed"
        ? { phase: "failed", error: event.error, cancel: undefined }
        : { phase: event.kind, cancel: undefined };

  return new Map(prev).set(event.matchId, { ...current, ...patch });
}

/**
 * The uploads that survive "Upload another": the ones still moving bytes.
 * Clearing everything would hide transfers that are still running, which is
 * exactly the bug keying by match fixes.
 */
export function keepRunningUploads(
  prev: Map<string, UploadState>,
): Map<string, UploadState> {
  const next = new Map(prev);
  for (const [id, u] of next) if (u.phase !== "uploading") next.delete(id);
  return next;
}
