import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UploadAbortedError,
  uploadFileInBlocks,
} from "@/lib/services/upload/azure-block-upload";
import { remuxedJobWindow } from "@/lib/video/trim-plan";
import {
  TrimCancelledError,
  discardPreparedVideo,
  prepareVideoForUpload,
} from "@/lib/video/trim";

/**
 * Getting one match's video to Advantage Intelligence.
 *
 * Lifted out of `useUploadMatchWizard.ts` unchanged so the team upload wizard
 * can run it once per video instead of keeping a second copy. The invariants in
 * `docs/ui-revamp-guardrails.md` §3.1 travel with it and are asserted here,
 * once, rather than in two files that drift:
 *
 *   - the `processing_jobs` insert `.select("id").single()`s, and every write
 *     below keys on THAT id. Keying on `match_id` touches every job a
 *     resubmitted match has ever had.
 *   - progress writes are throttled. They are a liveness heartbeat that
 *     `reap_stalled_uploads()` reads, not a progress bar.
 *   - a submit failure must NOT mark the job failed. The bytes are in Azure and
 *     `uploaded` is the one state a retry needs nothing re-uploaded from.
 *
 * Before any bytes move, the selected window is cut out of the file in the
 * browser (`lib/video/trim.ts`, a remux — no re-encode, audio kept). When that
 * succeeds the job row's window is rewritten to [0, cut length] BEFORE the
 * terminal `uploaded` write, because auto-submit builds the vendor's
 * StartTime/EndTime from the row and the file no longer starts where the
 * original did. When it can't cut, the original goes up with the window the
 * wizard wrote, exactly as before.
 *
 * What deliberately did NOT come along is the rollback. The personal wizard
 * deletes its just-created match when the job insert fails, which is right for
 * a row that exists only to carry this video; deleting a dual line's match
 * would destroy a recorded result. So the caller decides.
 */

/** Bytes moved so far, and what that implies. */
export interface VideoUploadProgress {
  /**
   * `preparing` while the window is being cut out of the file in the browser,
   * `uploading` once bytes move. `pct` restarts from 0 at the switch.
   */
  stage: "preparing" | "uploading";
  pct: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** Cumulative average, not instantaneous — smooth, and slow to react. */
  speed: number;
  etaSeconds: number;
}

export type VideoUploadEvent = { matchId: string } & (
  | {
      kind: "started";
      fileName: string;
      /** The `processing_jobs` row — what a "Try again" resubmits. */
      jobId: string;
      cancel: () => void;
    }
  | { kind: "progress"; progress: VideoUploadProgress }
  | { kind: "done" }
  /** Handed to the vendor. The transfer AND the submission both succeeded. */
  | { kind: "submitted" }
  /**
   * Uploaded, but the vendor would not take it.
   *
   * Distinct from `failed`: the video is safely stored and the job row still
   * says `uploaded`, so this is retryable without re-uploading anything.
   */
  | { kind: "submit_failed"; error: string }
  | { kind: "cancelled" }
  | { kind: "failed"; error: string }
);

/** The three answers no lineup and no event can know. */
export interface VideoAnswers {
  /**
   * Was our player at the TOP of the frame at video start?
   *
   * Camera-relative at the first frame, not player-relative: ends change every
   * odd game, so it describes the opening of the video and nothing else. It is
   * what maps the vendor's per-player predictions back onto the right person.
   */
  initialTopPlayerIsPlayer1?: boolean;
  /** Ad or no-ad. Comes from the event's format in a team workspace. */
  adScoring?: boolean;
  /** Did the camera stay in one position for the whole recording? */
  fixedCamera?: boolean;
}

export interface CreateProcessingJobInput {
  supabase: SupabaseClient;
  matchId: string;
  userId: string;
  provider: string;
  startSeconds: number;
  endSeconds: number;
  /** What the monthly cap is charged against — the trim window, not the file. */
  billableSeconds: number;
  /** False for a job queued before its file is picked. */
  hasFile: boolean;
}

/**
 * Reserve the job row. Throws on failure so the caller can roll back its own
 * way — see the note above about why the rollback did not come along.
 */
export async function createProcessingJob({
  supabase,
  matchId,
  userId,
  provider,
  startSeconds,
  endSeconds,
  billableSeconds,
  hasFile,
}: CreateProcessingJobInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .insert({
      match_id: matchId,
      created_by: userId,
      provider,
      status: hasFile ? "uploading" : "pending",
      start_time_seconds: startSeconds,
      end_time_seconds: endSeconds,
      billable_seconds: billableSeconds,
    })
    // The id comes back NOW. Submission is keyed on it, and so is every write
    // in uploadAndSubmitVideo.
    .select("id")
    .single();

  if (error || !data) {
    // 23505 on `processing_jobs_one_live_per_match`: this match already has a
    // non-terminal job — a second upload attempt for the same existing match
    // row (the `reusingMatch` / event-preset path) while the first is still
    // running. Rare (the wizard closes on success), but a friendly message
    // beats leaking the raw constraint-violation string to the error toast.
    if (error?.code === "23505") {
      throw new Error("An analysis is already in progress for this match.");
    }
    throw new Error(error?.message || "Couldn't queue this match for analysis");
  }

  return { id: data.id as string };
}

export interface UploadAndSubmitInput {
  supabase: SupabaseClient;
  jobId: string;
  matchId: string;
  file: File;
  /**
   * The selected window, in seconds into `file` — the same values the job row
   * was created with. When present and narrower than the clip, the file is cut
   * to it before upload.
   */
  trim?: { startSeconds: number; endSeconds: number };
  answers: VideoAnswers;
  onEvent?: (event: VideoUploadEvent) => void;
  /** Fired on a transfer failure, after the job row has been marked failed. */
  onTransferFailed?: (message: string) => void;
}

/**
 * Move the bytes, then hand the job to the vendor.
 *
 * Runs to completion in the background — the wizard that started it has usually
 * closed by the time this returns.
 */
export async function uploadAndSubmitVideo({
  supabase,
  jobId,
  matchId,
  file: pickedFile,
  trim,
  answers,
  onEvent,
  onTransferFailed,
}: UploadAndSubmitInput): Promise<void> {
  // Hand the canceller up before anything runs, so the screen that replaced
  // the wizard can offer a Cancel that works during the cut as well as the
  // transfer.
  const controller = new AbortController();
  onEvent?.({
    matchId,
    kind: "started",
    fileName: pickedFile.name,
    jobId,
    cancel: () => controller.abort(),
  });

  // The wizard has already closed by this point, so this guard is the only
  // thing telling the user the work is not finished. It says what is actually
  // at risk: the match is saved and survives, only the transfer dies with the
  // page.
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue =
      "Your video is still uploading. The match is saved, but leaving now cancels the upload and you'll have to add the video again.";
    return event.returnValue;
  };
  window.addEventListener("beforeunload", handleBeforeUnload);

  let preparedStorageName: string | null = null;

  try {
    let file = pickedFile;

    if (trim) {
      // `reap_stalled_uploads()` marks a job failed after 15 minutes without a
      // progress write. A long cut writes nothing, so keep the heartbeat going
      // at the same 60-second cadence the transfer uses.
      const heartbeat = window.setInterval(() => {
        void supabase
          .from("processing_jobs")
          .update({ upload_progress_percent: 0 })
          .eq("id", jobId);
      }, 60_000);

      let lastSentTenth = -1;
      try {
        const prepared = await prepareVideoForUpload(pickedFile, {
          startSeconds: trim.startSeconds,
          endSeconds: trim.endSeconds,
          signal: controller.signal,
          onProgress: (progress) => {
            const tenth = Math.round(progress * 1000);
            if (tenth === lastSentTenth) return;
            lastSentTenth = tenth;
            onEvent?.({
              matchId,
              kind: "progress",
              progress: {
                stage: "preparing",
                pct: tenth / 10,
                bytesUploaded: 0,
                bytesTotal: pickedFile.size,
                speed: 0,
                etaSeconds: 0,
              },
            });
          },
        });

        if (prepared.trimmed) {
          preparedStorageName = prepared.storageName;
          // The file now starts at the selected moment. The row must say so
          // before `uploaded` is written, or the vendor is told to seek into a
          // file that no longer has those seconds. Fatal if it doesn't land.
          const { error: windowError } = await supabase
            .from("processing_jobs")
            .update(remuxedJobWindow(prepared.durationSeconds))
            .eq("id", jobId);
          if (windowError) {
            throw new Error(
              `Couldn't record the trimmed window: ${windowError.message}`,
            );
          }
          file = prepared.file;
        } else if (prepared.reason !== "whole-clip") {
          console.info(
            "Uploading the original video without cutting it:",
            prepared.reason,
          );
        }
      } finally {
        window.clearInterval(heartbeat);
      }
    }

    const res = await fetch("/api/splitstep/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, fileName: file.name }),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.uploadUrl) {
      throw new Error(
        payload?.error || `Could not get an upload URL (HTTP ${res.status})`,
      );
    }

    const { uploadUrl, videoObjectKey } = payload;
    // Log the key, never the URL. `uploadUrl` is a live write credential — six
    // hours of write access to this blob — and the browser console outlives the
    // upload: it survives screen shares, extensions, and anyone opening
    // devtools. The key is what you actually want when debugging anyway.
    console.log("🚀 Upload credential acquired for:", videoObjectKey);

    const startedAt = Date.now();

    try {
      // Write on a 2-point move or every 60 seconds, whichever comes first. The
      // old rule was `pct % 10 === 0`, which skipped the write entirely whenever
      // a chunk boundary stepped over a multiple of ten. Not cosmetic: this
      // column is the liveness signal `reap_stalled_uploads()` reads, and 15
      // minutes without one marks the job failed underneath a running upload.
      let lastWrittenPct = -1;
      let lastWriteAt = 0;
      // The UI renders one decimal, so events that cannot change a rendered
      // digit are dropped before they reach React. On a 5 GB upload 0.1% is ~7
      // seconds of transfer.
      let lastSentTenth = -1;

      await uploadFileInBlocks({
        file,
        uploadUrl,
        contentType: file.type || "video/mp4",
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const exact = (loaded / total) * 100;
          const pct = Math.floor(exact);
          const now = Date.now();

          // Local UI first: throttled only to the precision it can actually
          // show, not to the database's cadence. A bar that moves once a minute
          // is the problem this exists to fix.
          const tenth = Math.round(exact * 10);
          if (tenth !== lastSentTenth) {
            lastSentTenth = tenth;
            const elapsed = (now - startedAt) / 1000;
            const speed = elapsed > 0 ? loaded / elapsed : 0;
            onEvent?.({
              matchId,
              kind: "progress",
              progress: {
                stage: "uploading",
                pct: tenth / 10,
                bytesUploaded: loaded,
                bytesTotal: total,
                speed,
                etaSeconds: speed > 0 ? (total - loaded) / speed : 0,
              },
            });
          }

          // The database write stays throttled. It is a liveness heartbeat, not
          // a progress bar, and one write per XHR event on a 600-block upload
          // would be tens of thousands.
          if (pct - lastWrittenPct < 2 && now - lastWriteAt < 60_000) return;
          lastWrittenPct = pct;
          lastWriteAt = now;

          // Fire-and-forget: a dropped progress write must never disturb the
          // upload itself.
          void supabase
            .from("processing_jobs")
            .update({ upload_progress_percent: pct })
            .eq("id", jobId)
            .then(({ error }) => {
              if (error) {
                console.warn(
                  "Could not record upload progress:",
                  error.message,
                );
              }
            });
        },
      });
    } finally {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // The bytes are committed in Azure; the local cut has done its job.
    if (preparedStorageName) {
      void discardPreparedVideo(preparedStorageName);
      preparedStorageName = null;
    }

    await supabase
      .from("processing_jobs")
      .update({
        video_object_key: videoObjectKey,
        status: "uploaded",
        // Explicitly 100. The throttle above skips the final write — 99→100 is
        // a 1-point move and the last block rarely takes 60 seconds — so
        // without this the bar sits at 99 forever.
        upload_progress_percent: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    onEvent?.({ matchId, kind: "done" });

    // Hand it to the vendor. The route owns everything from here: ownership,
    // quota reservation, payload build, the POST, and recording
    // external_job_id.
    //
    // Reported separately from the transfer, and deliberately does NOT mark the
    // job failed. The bytes are safely in Azure and the row still says
    // `uploaded`, which is both true and retryable.
    try {
      const submitRes = await fetch("/api/splitstep/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          initialTopPlayerIsPlayer1: answers.initialTopPlayerIsPlayer1,
          adScoring: answers.adScoring,
          fixedCamera: answers.fixedCamera,
        }),
      });

      const submitPayload = await submitRes.json().catch(() => null);

      if (!submitRes.ok) {
        // details[] is the payload builder's field list on a 422 — far more use
        // than the summary line.
        const detail = Array.isArray(submitPayload?.details)
          ? submitPayload.details.join(" ")
          : "";
        throw new Error(
          [
            submitPayload?.error ??
              `Submission failed (HTTP ${submitRes.status})`,
            detail,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }

      console.log(
        "📤 Submitted for analysis:",
        submitPayload?.externalJobId ?? "(no id returned)",
      );
      onEvent?.({ matchId, kind: "submitted" });
    } catch (submitErr) {
      const message =
        submitErr instanceof Error
          ? submitErr.message
          : "Could not submit for analysis";
      console.error(
        "Submission failed — the video is uploaded and can be retried:",
        message,
      );

      // Recorded, not fatal. Status stays `uploaded`.
      await supabase
        .from("processing_jobs")
        .update({
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      onEvent?.({ matchId, kind: "submit_failed", error: message });
    }
  } catch (uploadErr) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    if (preparedStorageName) void discardPreparedVideo(preparedStorageName);

    const cancelled =
      uploadErr instanceof UploadAbortedError ||
      uploadErr instanceof TrimCancelledError;
    console[cancelled ? "log" : "error"](
      cancelled ? "Upload cancelled by the user" : "❌ Video upload error:",
      cancelled ? "" : uploadErr,
    );

    const message =
      uploadErr instanceof Error ? uploadErr.message : "Video upload failed";
    onEvent?.(
      cancelled
        ? { matchId, kind: "cancelled" }
        : { matchId, kind: "failed", error: message },
    );

    await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Fires on a user cancel too. That is what the wizard did before this move
    // and it is preserved deliberately — arguably a cancel should not surface
    // as a failure, but changing it here would be a behaviour change smuggled
    // into a refactor.
    onTransferFailed?.(message);
  }
}
