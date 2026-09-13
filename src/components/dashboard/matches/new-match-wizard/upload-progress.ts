import type {
  VideoUploadEvent,
  VideoUploadProgress,
} from "./useUploadMatchWizard";

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
  progress?: VideoUploadProgress;
  error?: string;
  cancel?: () => void;
}

export type UploadPhase = UploadState["phase"];

/** One source for phase colour, so the label ink cannot disagree with the track. */
export const PHASE_INK: Record<UploadPhase, string> = {
  uploading: "#3B82F6",
  // Uploaded but not yet handed over is still in motion, so it reads as action
  // rather than success — the green is reserved for the vendor accepting it.
  done: "#3B82F6",
  submitted: "#5DB955",
  submit_failed: "#E51837",
  cancelled: "#E51837",
  failed: "#E51837",
};

export const PHASE_LABEL: Record<Exclude<UploadPhase, "uploading">, string> = {
  done: "Submitting…",
  submitted: "Submitted",
  submit_failed: "Not submitted",
  cancelled: "Cancelled",
  failed: "Failed",
};

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

/** How the success screen reads a set of uploads, derived in one place. */
export function summarizeUploads(uploads: readonly UploadState[]) {
  const uploading = uploads.filter((u) => u.phase === "uploading");
  const problems = uploads.filter(
    (u) =>
      u.phase === "failed" ||
      u.phase === "cancelled" ||
      u.phase === "submit_failed",
  );
  const busy = uploading.length > 0 || uploads.some((u) => u.phase === "done");
  return { uploading, problems, busy };
}
