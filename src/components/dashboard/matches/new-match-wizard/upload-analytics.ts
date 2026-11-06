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

export function trackUploadStarted(provider: string | null): void {
  wizardStartedAt = Date.now();
  selectedVideoBytes = null;
  track("upload_started", { provider });
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

export function trackUploadFailed(
  step: string,
  error: unknown,
  matchId?: string,
): void {
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
