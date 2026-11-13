import { safeErrorMessage, secondsSince, toMb, track } from "@/lib/analytics";

/**
 * Upload-funnel analytics for the wizard (`upload_*`, `video_selected`,
 * `match_created`). Kept out of the wizard hook so the hook's state stays
 * what the screen needs and nothing more.
 *
 * The file is picked deep in the wizard and the transfer is reported up to
 * `UploadMatchFlow` as `VideoUploadEvent`s that carry no size, so the last
 * picked file's size waits here between the two. Module state is enough: one
 * wizard per tab, and each new pick replaces it.
 */
let selectedVideoBytes: number | null = null;
let wizardStartedAt: number | null = null;
// Per match, so a transfer still running after "Upload another" reports its
// own file rather than the next one picked.
const transfers = new Map<
  string,
  { startedAt: number; bytes: number | null }
>();

// The last step view sent, so a re-render that changes nothing sends nothing.
let lastStepView: string | null = null;

export function trackUploadStarted(provider: string | null): void {
  wizardStartedAt = Date.now();
  selectedVideoBytes = null;
  // A new run: its first step is a new view, even where it is the step and
  // source the last run ended on.
  lastStepView = null;
  track("upload_started", { provider });
}

/**
 * The step now on screen. `upload_failed` only says where a refusal happened;
 * a visitor who leaves without one left no trace of how far they got, and
 * "opened the wizard, no match" could not be told from "reached the video
 * step and had no file". Sent once per step and source, so Back and Continue
 * each leave a mark and a re-render does not. `trackUploadStarted()` must
 * have run first for this run: it starts the clock and clears the last view.
 */
export function trackUploadStepViewed(view: {
  step: string;
  stepNumber: number;
  stepCount: number;
  provider: string | null;
  fileAttached: boolean;
}): void {
  const key = `${view.step}|${view.provider ?? ""}`;
  if (key === lastStepView) return;
  lastStepView = key;
  track("upload_step_viewed", {
    step: view.step,
    step_number: view.stepNumber,
    step_count: view.stepCount,
    provider: view.provider,
    file_attached: view.fileAttached,
    time_since_upload_started_sec:
      wizardStartedAt == null ? null : secondsSince(wizardStartedAt),
  });
}

export function trackVideoSelected(file: File, durationSec: number | null) {
  selectedVideoBytes = file.size;
  track("video_selected", {
    file_size_mb: toMb(file.size),
    duration_sec:
      durationSec != null && Number.isFinite(durationSec)
        ? Math.round(durationSec)
        : null,
    // The container type only; the file NAME is never sent.
    mime_type: file.type || "unknown",
  });
}

export function trackMatchCreated(matchId: string): void {
  track("match_created", {
    match_id: matchId,
    time_since_upload_started_sec:
      wizardStartedAt == null ? null : secondsSince(wizardStartedAt),
  });
}

export function trackTransferStarted(matchId: string): void {
  transfers.set(matchId, { startedAt: Date.now(), bytes: selectedVideoBytes });
}

export function trackUploadCompleted(matchId: string): void {
  const transfer = transfers.get(matchId);
  transfers.delete(matchId);
  track("upload_completed", {
    file_size_mb: transfer?.bytes == null ? 0 : toMb(transfer.bytes),
    upload_duration_sec: transfer ? secondsSince(transfer.startedAt) : 0,
  });
}

// Matches whose failure has been sent, so the window event that follows a
// transfer's own `"failed"` (UploadMatchFlow) does not count it twice.
const failedMatches = new Set<string>();

export function trackUploadFailed(
  step: string,
  error: unknown,
  matchId?: string,
): void {
  if (matchId) {
    if (failedMatches.has(matchId)) return;
    failedMatches.add(matchId);
  }
  const transfer = matchId ? transfers.get(matchId) : undefined;
  if (matchId) transfers.delete(matchId);
  const bytes = transfer ? transfer.bytes : selectedVideoBytes;
  track("upload_failed", {
    step,
    error_message: safeErrorMessage(error),
    file_size_mb: bytes == null ? null : toMb(bytes),
  });
}

/** A picked video the wizard refused or could not read — before any upload. */
export function trackVideoRejected(step: string, error: unknown, file: File) {
  track("upload_failed", {
    step,
    error_message: safeErrorMessage(error),
    file_size_mb: toMb(file.size),
  });
}
