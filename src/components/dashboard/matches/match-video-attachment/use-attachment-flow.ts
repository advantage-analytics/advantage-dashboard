"use client";

/**
 * Orchestration for the SwingVision video attachment wizard (plan step 13).
 *
 * The three pieces this drives each refuse to act on their own, deliberately:
 * the file step (T17) verifies a recording and sends nothing, the alignment
 * step (T18) validates one position and saves nothing, and the transport (T19)
 * moves bytes only when it is called. This hook is the only place that decides
 * anything happens at all, and it decides it exactly once — on the final
 * confirmation, never on selection and never on a keystroke.
 *
 * ── What this flow must never do ─────────────────────────────────────────
 *
 * It attaches a video to a match that ALREADY EXISTS. It creates no match, no
 * draft and no `processing_jobs` row; it invokes no analysis hook and reserves
 * no analysis quota. Nothing here imports `useUploadMatchWizard` or
 * `lib/services/splitstep/**`, and a flow spec asserts the only requests a
 * whole add/replace/adjust ever makes are this feature's own four endpoints.
 * The 2-hour monthly cap belongs to the Advantage Intelligence vendor path
 * next door; an attachment is played back beside imported
 * SwingVision data and never reaches that vendor.
 *
 * ── The file is cut before it moves ─────────────────────────────────────
 *
 * Add and replace keep only the match: `defaultAttachmentTrimWindow` pads the
 * marked first point and the last required source instant by ten seconds, and
 * the upload wizard's own remux (`prepareVideoForUpload`, no re-encode) cuts
 * that window out locally before a byte is reserved. The completion then
 * carries the first point's position IN THE CUT (`marked − start`); the server
 * derives the same offset from it and re-checks coverage against the cut's
 * verified duration, so nothing server-side knows a cut happened. Any reason
 * the cut cannot be made — no OPFS, no quota, a container the remuxer cannot
 * copy, a window that is the whole clip — uploads the original with the
 * original position, which is exactly the pre-trim behaviour. The cut lives in
 * OPFS until the attempt ends, and is discarded however it ends. An adjust has
 * no file and never cuts.
 *
 * ── One logical attempt, across retries ──────────────────────────────────
 *
 * `clientRequestId` identifies an ATTEMPT, not a request. It is minted on the
 * first submit and held across a user-visible "Try again", because the failure
 * worth designing for is a reservation whose RESPONSE was lost: the row exists,
 * the client never learned its id, and a retry carrying a fresh id would
 * collide with its own pending attempt instead of finding it. It is dropped
 * only when the attempt genuinely ends — a publication, or a different file,
 * which is a different attempt by definition.
 *
 * ── Progress is throttled here ───────────────────────────────────────────
 *
 * The transport reports whatever `XMLHttpRequest.upload` fires, which on a
 * fast link is hundreds of events a second across four sockets. React is not
 * the right place to find that out, so the rate limit lives here: a tenth of a
 * percentage point, a phase change, or the last byte. The same 0.1% step the
 * vendor wizard uses (`docs/ui-revamp-guardrails.md` §3.1) — and for the same
 * reason.
 *
 * ── Cancellation, and the tab that just closed ───────────────────────────
 *
 * Cancel and unmount both abort the transfer, which retires its own attempt on
 * the way out. A closed tab cannot: no cleanup runs once the document is gone.
 * So `pagehide` fires the cancellation as a `keepalive` request the browser
 * finishes after the page is torn down. It is `fetch(..., { keepalive: true })`
 * rather than `navigator.sendBeacon`, which can only POST, and the cancel is a
 * DELETE. Best effort in every case: the durable cleanup worker (T14) is what
 * guarantees an abandoned attempt is collected.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Alignment,
  SourcePoint,
  SourceShot,
} from "@/lib/match-video/alignment";
import {
  defaultAttachmentTrimWindow,
  planTrimmedAlignment,
} from "@/lib/match-video/trim-window";
import {
  matchVideoError,
  modeUploadsFile,
  type ActiveAttachment,
  type ExpectedActiveAttachment,
  type MatchVideoMode,
  type UpdateAlignmentRequest,
  type UpdateAlignmentResult,
} from "@/lib/match-video/types";
import { discardPreparedVideo, prepareVideoForUpload } from "@/lib/video/trim";

import {
  transferAttachment,
  type AttachmentTransferError,
  type AttachmentTransferProgress,
} from "./attachment-upload";
import type { AttachmentTrimSelection } from "./use-attachment-alignment";
import {
  useAttachmentFile,
  type AttachmentFileApi,
  type AttachmentSelection,
} from "./use-attachment-file";

/* -------------------------------------------------------------------------
 * Steps
 * ---------------------------------------------------------------------- */

/**
 * Add and replace ask two questions; adjust asks the one that changed.
 *
 * A correction already has a published file with a server-verified duration,
 * so there is no file to pick and no bytes to move — offering a file step
 * there would be offering a replacement under another name.
 */
export type AttachmentFlowStep = "file" | "align";

export function attachmentFlowSteps(
  mode: MatchVideoMode,
): readonly AttachmentFlowStep[] {
  return modeUploadsFile(mode)
    ? (["file", "align"] as const)
    : (["align"] as const);
}

/* -------------------------------------------------------------------------
 * Save state
 * ---------------------------------------------------------------------- */

/**
 * Which part of the commit is running.
 *
 * `trimming` is local work — the window being cut out of the picked file —
 * and happens before anything is reserved. The rest mirror the transport's own
 * phases, plus `aligning` for an adjust's single PATCH.
 */
export type AttachmentSavePhase =
  "trimming" | "reserving" | "uploading" | "committing" | "aligning";

/**
 * What the footer and the content strip are saying about the commit.
 *
 * `saved` is a terminal state that the flow stays in while the caller
 * navigates: the return is the caller's to perform (T21/T22 own the verified
 * Film selection contract), and until it happens the page must not look
 * finished and must not look re-submittable.
 */
export type AttachmentSaveState =
  | { status: "idle" }
  | {
      status: "saving";
      phase: AttachmentSavePhase;
      /** The sentence shown beside the meter. */
      label: string;
      /**
       * 0–100 while real work is measured — bytes moving, or the cut's own
       * progress while trimming — else null. Never invented.
       */
      percent: number | null;
      bytesTransferred: number;
      /** The size of the file being moved; while trimming, the original's. */
      totalBytes: number;
      /**
       * While trimming: the bytes the cut keeps. Estimated from the window's
       * share of the file while the cut runs, then the cut's measured size
       * once it lands. Null in every other phase.
       */
      keptBytes: number | null;
      /** False once the bytes are in and only the publication is running. */
      canCancel: boolean;
    }
  | { status: "saved"; attachment: ActiveAttachment }
  | { status: "failed"; error: AttachmentTransferError };

/** Emitted progress is rounded to this many percentage points. */
export const PROGRESS_STEP_PERCENT = 0.1;

/* -------------------------------------------------------------------------
 * The alignment-only write
 * ---------------------------------------------------------------------- */

export type AlignmentUpdateOutcome =
  | { ok: true; attachment: ActiveAttachment }
  | { ok: false; aborted: boolean; error: AttachmentTransferError };

export interface UpdateAlignmentInput {
  matchId: string;
  attachmentId: string;
  expectedVersion: number;
  confirmedVideoTimeSeconds: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/**
 * `PATCH .../video/alignment`, and nothing else.
 *
 * A correction has no upload to authorize, no SAS to mint and no blob to
 * touch: it recomputes one number from the imported rows and the duration the
 * server measured at publication. So this deliberately does not reach the
 * reservation endpoint even to "prepare" — a reservation is what creates a
 * pending attempt, and a pending attempt is what a second tab is refused
 * against.
 */
export async function updateAlignment(
  input: UpdateAlignmentInput,
): Promise<AlignmentUpdateOutcome> {
  const doFetch =
    input.fetch ??
    ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const body: UpdateAlignmentRequest = {
    attachmentId: input.attachmentId,
    expectedVersion: input.expectedVersion,
    confirmedVideoTimeSeconds: input.confirmedVideoTimeSeconds,
  };

  let response: Response;
  try {
    response = await doFetch(
      `/api/matches/${encodeURIComponent(input.matchId)}/video/alignment`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: input.signal,
      },
    );
  } catch {
    if (input.signal?.aborted) {
      return {
        ok: false,
        aborted: true,
        error: matchVideoError("storage_unavailable", "aborted"),
      };
    }
    return {
      ok: false,
      aborted: false,
      error: matchVideoError("storage_unavailable", "alignment_network"),
    };
  }

  if (response.ok) {
    try {
      const result = (await response.json()) as UpdateAlignmentResult;
      return { ok: true, attachment: result.attachment };
    } catch {
      return {
        ok: false,
        aborted: false,
        error: matchVideoError("storage_unavailable", "alignment_malformed"),
      };
    }
  }

  // The server's own code and sentence, passed through. Re-deriving either
  // from the status invents a disagreement the first time one of them changes.
  try {
    const shape = (await response.json()) as Record<string, unknown>;
    if (typeof shape.code === "string" && typeof shape.error === "string") {
      return {
        ok: false,
        aborted: false,
        error: {
          code: shape.code,
          status: response.status,
          message: shape.error,
          detail:
            typeof shape.detail === "string"
              ? shape.detail
              : `alignment_${response.status}`,
        },
      };
    }
  } catch {
    // A refusal that is not JSON came from a proxy or an edge, not from us.
  }
  return {
    ok: false,
    aborted: false,
    error: {
      code: "internal_error",
      status: response.status,
      message: "Something went wrong on our side. Try again in a moment.",
      detail: `alignment_${response.status}`,
    },
  };
}

/* -------------------------------------------------------------------------
 * Options
 * ---------------------------------------------------------------------- */

/** `prepareVideoForUpload`'s shape, so a spec can stand in for the remux. */
export type PrepareAttachmentVideo = typeof prepareVideoForUpload;

export interface AttachmentFlowDeps {
  /** Cuts the kept window out of the picked file. Never called by an adjust. */
  prepare: PrepareAttachmentVideo;
  /** Removes a cut from OPFS once its attempt has ended, however it ended. */
  discardPrepared: (storageName: string) => Promise<void>;
  /** The kept window for a marked first point. Seam for a shorter pad. */
  trimWindow: typeof defaultAttachmentTrimWindow;
  transfer: typeof transferAttachment;
  updateAlignment: typeof updateAlignment;
  fetch: typeof fetch;
  randomUUID: () => string;
}

export interface UseAttachmentFlowOptions {
  matchId: string;
  mode: MatchVideoMode;
  /**
   * The attachment this match is already serving, when it has one. Required by
   * `replace` and `align`, and its `{ id, version }` is the optimistic-
   * concurrency claim every write carries. `null` on a first add IS the claim
   * — an omitted field and an explicit null are not the same thing.
   */
  activeAttachment: ActiveAttachment | null;
  /**
   * The imported rows, so the kept window can be checked with the same
   * coverage rule the server runs before anything is cut.
   */
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  /**
   * Called once the commit's result is KNOWN and committed, never before.
   *
   * The return target is the caller's: T21/T22 own the verified Film selection
   * contract, and hard-coding a route here would make this component wrong the
   * moment that contract lands. A caller that navigates from here is navigating
   * on a published attachment, which is the whole reason this is not fired
   * optimistically.
   */
  onSaved?: (attachment: ActiveAttachment) => void;
  /** Test seam. Production passes nothing. */
  deps?: Partial<AttachmentFlowDeps>;
}

export interface AttachmentFlowApi {
  steps: readonly AttachmentFlowStep[];
  step: AttachmentFlowStep;
  stepIndex: number;
  /** Selection and local verification. Its state outlives a step change. */
  file: AttachmentFileApi;
  selection: AttachmentSelection | null;
  /** The validated alignment, or null while there is not one. */
  alignment: Alignment | null;
  setAlignment: (alignment: Alignment | null) => void;
  /**
   * The alignment field's text, held HERE so stepping back to check a filename
   * does not throw away a position someone scrubbed for.
   */
  confirmedText: string;
  setConfirmedText: (text: string) => void;
  /**
   * The kept window the alignment step is showing, with the mark it was set
   * around — held here for the same reason as the text, and because it is
   * what submit cuts. Null until a submittable window exists.
   */
  trim: AttachmentTrimSelection | null;
  setTrim: (trim: AttachmentTrimSelection | null) => void;
  /** The default-window function submit falls back to; the step draws with it. */
  trimWindowFor: AttachmentFlowDeps["trimWindow"];
  expectedActive: ExpectedActiveAttachment | null;
  save: AttachmentSaveState;
  /** True while a commit is in flight — the whole step is held, not just the button. */
  isBusy: boolean;
  canContinue: boolean;
  goNext: () => void;
  goBack: () => void;
  submit: () => void;
  cancel: () => void;
}

function resolveDeps(
  overrides: Partial<AttachmentFlowDeps> | undefined,
): AttachmentFlowDeps {
  return {
    prepare: overrides?.prepare ?? prepareVideoForUpload,
    discardPrepared: overrides?.discardPrepared ?? discardPreparedVideo,
    trimWindow: overrides?.trimWindow ?? defaultAttachmentTrimWindow,
    transfer: overrides?.transfer ?? transferAttachment,
    updateAlignment: overrides?.updateAlignment ?? updateAlignment,
    fetch: overrides?.fetch ?? ((...args) => globalThis.fetch(...args)),
    randomUUID: overrides?.randomUUID ?? (() => globalThis.crypto.randomUUID()),
  };
}

/* -------------------------------------------------------------------------
 * The hook
 * ---------------------------------------------------------------------- */

export function useAttachmentFlow(
  options: UseAttachmentFlowOptions,
): AttachmentFlowApi {
  const { matchId, mode, activeAttachment, points, shots, onSaved } = options;
  const deps = useMemo(
    () => resolveDeps(options.deps),
    // The seam object is read on submit only; a caller passing a fresh literal
    // every render must not re-create the whole flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const steps = useMemo(() => attachmentFlowSteps(mode), [mode]);
  const uploadsFile = modeUploadsFile(mode);

  const [step, setStep] = useState<AttachmentFlowStep>(steps[0]);
  const [save, setSave] = useState<AttachmentSaveState>({ status: "idle" });
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [confirmedText, setConfirmedText] = useState("");
  const [trim, setTrim] = useState<AttachmentTrimSelection | null>(null);

  /* ---------------------------------------------------------------------
   * Commit machinery
   *
   * Declared before the file hook because a swapped file voids the attempt
   * these refs identify, and the reset handler below reaches for them.
   * ------------------------------------------------------------------ */

  const mounted = useRef(true);
  /** Bumped per submit AND on unmount, so a late result lands nowhere. */
  const run = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** Survives a "Try again". See the module docstring. */
  const clientRequestId = useRef<string | null>(null);
  /** The attempt a closed tab still has to retire. */
  const pendingAttachmentId = useRef<string | null>(null);
  /** The last progress this hook actually pushed into React. */
  const lastReport = useRef<{ phase: string; percent: number } | null>(null);

  /* ---------------------------------------------------------------------
   * File selection
   * ------------------------------------------------------------------ */

  /**
   * A different recording voids everything measured against the last one.
   *
   * The confirmation, the alignment it produced, and the logical attempt that
   * would have carried it are all about a file that is no longer selected. The
   * alignment hook resets its own field on a source change; this is the other
   * half, and it is why a swapped file cannot arrive at the transport wearing
   * the previous attempt's id.
   */
  const onSelectionChange = useCallback(() => {
    setAlignment(null);
    setConfirmedText("");
    setTrim(null);
    clientRequestId.current = null;
    setSave((previous) =>
      previous.status === "failed" ? { status: "idle" } : previous,
    );
  }, []);

  const file = useAttachmentFile({ onSelectionChange });
  const selection = file.selection;

  useEffect(() => {
    return () => {
      mounted.current = false;
      run.current += 1;
      // Leaving mid-transfer stops the sockets; the transport retires its own
      // attempt on the way out, and the cleanup worker covers the rest.
      abort.current?.abort();
    };
  }, []);

  /**
   * A tab closed mid-upload, which no unmount and no `finally` will see.
   *
   * `keepalive` is what lets the request outlive the document. `sendBeacon`
   * would be the reflex here and cannot be used: it only sends POST, and
   * cancellation is a DELETE on the attempt.
   */
  useEffect(() => {
    const onHide = () => {
      const attachmentId = pendingAttachmentId.current;
      if (!attachmentId) return;
      pendingAttachmentId.current = null;
      try {
        void deps
          .fetch(
            `/api/matches/${encodeURIComponent(matchId)}/video/uploads/${encodeURIComponent(attachmentId)}`,
            {
              method: "DELETE",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              keepalive: true,
            },
          )
          .catch(() => {
            // Durable cleanup covers a cancellation that never arrived.
          });
      } catch {
        // Same.
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [deps, matchId]);

  const expectedActive = useMemo<ExpectedActiveAttachment | null>(
    () =>
      mode !== "add" && activeAttachment
        ? { id: activeAttachment.id, version: activeAttachment.version }
        : null,
    [mode, activeAttachment],
  );

  /**
   * Throttle, then translate.
   *
   * Bytes are the truth while they are moving and become useless the moment
   * the last block commits — the publication is an Azure server-side copy this
   * browser cannot see the progress of, so it is named rather than guessed at.
   * Inventing a percentage for it would be a fake progress bar, which the
   * design system bans by name.
   */
  const reportProgress = useCallback((progress: AttachmentTransferProgress) => {
    const percent =
      progress.totalBytes > 0
        ? Math.min(100, (progress.bytesTransferred / progress.totalBytes) * 100)
        : 0;
    const previous = lastReport.current;
    const finished = progress.bytesTransferred >= progress.totalBytes;
    if (
      previous &&
      previous.phase === progress.phase &&
      !finished &&
      percent - previous.percent < PROGRESS_STEP_PERCENT
    ) {
      return;
    }
    lastReport.current = { phase: progress.phase, percent };

    const uploading = progress.phase === "uploading";
    setSave({
      status: "saving",
      phase: progress.phase,
      label:
        progress.phase === "reserving"
          ? "Preparing the upload…"
          : uploading
            ? "Uploading the video"
            : // Bytes are in; what is left is the publication.
              "Saving video",
      percent: uploading ? Math.round(percent * 10) / 10 : null,
      bytesTransferred: progress.bytesTransferred,
      totalBytes: progress.totalBytes,
      keptBytes: null,
      canCancel: progress.phase !== "committing",
    });
  }, []);

  /** The cut's progress, on the same 0.1-point throttle as the bytes. */
  const reportTrim = useCallback(
    (fraction: number, totalBytes: number, keptBytes: number) => {
      const percent = Math.min(100, Math.max(0, fraction * 100));
      const previous = lastReport.current;
      if (
        previous &&
        previous.phase === "trimming" &&
        percent < 100 &&
        percent - previous.percent < PROGRESS_STEP_PERCENT
      ) {
        return;
      }
      lastReport.current = { phase: "trimming", percent };
      setSave({
        status: "saving",
        phase: "trimming",
        label: "Cutting the video to the match",
        percent: Math.round(percent * 10) / 10,
        bytesTransferred: 0,
        totalBytes,
        keptBytes,
        canCancel: true,
      });
    },
    [],
  );

  const submit = useCallback(() => {
    // Duplicate submissions are held here rather than at the button, because
    // Enter, a double click and a second tap all arrive at this function.
    if (busy.current) return;
    if (!alignment) return;
    if (uploadsFile && !selection) return;
    if (!uploadsFile && !activeAttachment) return;

    busy.current = true;
    const mine = (run.current += 1);
    const settle = (next: AttachmentSaveState) => {
      if (!mounted.current || mine !== run.current) return false;
      setSave(next);
      return true;
    };

    void (async () => {
      try {
        if (!uploadsFile) {
          lastReport.current = null;
          settle({
            status: "saving",
            phase: "aligning",
            label: "Saving the alignment",
            percent: null,
            bytesTransferred: 0,
            totalBytes: 0,
            keptBytes: null,
            canCancel: false,
          });
          const controller = new AbortController();
          abort.current = controller;
          const result = await deps.updateAlignment({
            matchId,
            attachmentId: activeAttachment!.id,
            expectedVersion: activeAttachment!.version,
            confirmedVideoTimeSeconds: alignment.confirmedVideoTimeSeconds,
            signal: controller.signal,
            fetch: deps.fetch,
          });
          if (result.ok) {
            if (settle({ status: "saved", attachment: result.attachment })) {
              onSaved?.(result.attachment);
            }
            return;
          }
          // An abort is an answer, not an apology: nothing is rendered for it.
          settle(
            result.aborted
              ? { status: "idle" }
              : { status: "failed", error: result.error },
          );
          return;
        }

        lastReport.current = null;
        const controller = new AbortController();
        abort.current = controller;
        clientRequestId.current ??= deps.randomUUID();

        const picked = selection!;
        let upload: AttachmentSelection = picked;
        let confirmedVideoTimeSeconds = alignment.confirmedVideoTimeSeconds;
        /** Set once a cut exists in OPFS; discarded however this attempt ends. */
        let preparedStorageName: string | null = null;

        let result: Awaited<ReturnType<typeof deps.transfer>>;
        try {
          // The window on screen when it belongs to this mark — the person
          // may have moved either cut — else the default the step would draw.
          const keep =
            trim !== null &&
            trim.markedSeconds === alignment.confirmedVideoTimeSeconds
              ? trim.window
              : deps.trimWindow({
                  markedSeconds: alignment.confirmedVideoTimeSeconds,
                  timing: alignment.timing,
                  videoDurationSeconds: picked.durationSeconds,
                });
          // The server's coverage rule, against the clip this window WOULD
          // produce. The default window always passes, and the step holds
          // the alignment back while an adjusted one fails; a window that
          // still does not is not cut, because the server would refuse it.
          const trimmed = planTrimmedAlignment({
            points,
            shots,
            markedSeconds: alignment.confirmedVideoTimeSeconds,
            window: keep,
          });

          if (trimmed.ok) {
            const share =
              picked.durationSeconds > 0
                ? (keep.endSeconds - keep.startSeconds) / picked.durationSeconds
                : 1;
            const estimatedKept = Math.round(
              picked.sizeBytes * Math.min(1, Math.max(0, share)),
            );
            reportTrim(0, picked.sizeBytes, estimatedKept);

            let prepared: Awaited<ReturnType<typeof deps.prepare>> | null =
              null;
            try {
              prepared = await deps.prepare(picked.file, {
                startSeconds: keep.startSeconds,
                endSeconds: keep.endSeconds,
                signal: controller.signal,
                onProgress: (fraction) =>
                  reportTrim(fraction, picked.sizeBytes, estimatedKept),
              });
            } catch {
              // `prepareVideoForUpload` rejects only on cancellation; anything
              // else is a cut that could not be made, and a larger upload is
              // always better than no upload.
              if (controller.signal.aborted) {
                settle({ status: "idle" });
                return;
              }
            }

            if (prepared?.trimmed) {
              preparedStorageName = prepared.storageName;
              if (controller.signal.aborted) {
                settle({ status: "idle" });
                return;
              }
              reportTrim(1, picked.sizeBytes, prepared.file.size);
              upload = {
                ...picked,
                file: prepared.file,
                filename: prepared.file.name,
                sizeBytes: prepared.file.size,
                // The cut is always an MP4 remux, whatever was picked.
                contentType: "video/mp4",
                durationSeconds: prepared.durationSeconds,
              };
              // The first serve's position in the CUT. The server derives the
              // same offset from it: anchor − (marked − start).
              confirmedVideoTimeSeconds =
                trimmed.value.confirmedVideoTimeSeconds;
            }
          }

          lastReport.current = null;
          result = await deps.transfer({
            matchId,
            selection: upload,
            confirmedVideoTimeSeconds,
            expectedActive,
            clientRequestId: clientRequestId.current,
            signal: controller.signal,
            onProgress: reportProgress,
            onReserved: (attachmentId) => {
              pendingAttachmentId.current = attachmentId;
            },
          });
        } finally {
          // Success, failure and cancel alike: the bytes are either in Azure
          // or not going there from this copy. A retry cuts again.
          if (preparedStorageName) {
            void deps.discardPrepared(preparedStorageName).catch(() => {});
          }
        }
        pendingAttachmentId.current = null;

        if (result.ok) {
          // The attempt ended in a publication, so the id that identified it
          // has nothing left to find.
          clientRequestId.current = null;
          if (settle({ status: "saved", attachment: result.attachment })) {
            onSaved?.(result.attachment);
          }
          return;
        }
        settle(
          result.aborted
            ? { status: "idle" }
            : { status: "failed", error: result.error },
        );
      } catch {
        // The transport answers with values; reaching here is a bug on this
        // side, and the person still needs a way forward.
        settle({
          status: "failed",
          error: matchVideoError("storage_unavailable", "flow_failed"),
        });
      } finally {
        busy.current = false;
        abort.current = null;
      }
    })();
  }, [
    activeAttachment,
    alignment,
    deps,
    expectedActive,
    matchId,
    onSaved,
    points,
    reportProgress,
    reportTrim,
    selection,
    shots,
    trim,
    uploadsFile,
  ]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  /* ---------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */

  const isBusy = save.status === "saving";
  const stepIndex = Math.max(0, steps.indexOf(step));

  const canContinue =
    !isBusy &&
    save.status !== "saved" &&
    (step === "file" ? selection !== null : alignment !== null);

  const goNext = useCallback(() => {
    if (isBusy || save.status === "saved") return;
    if (step === "file") {
      if (!selection) return;
      setStep("align");
      return;
    }
    submit();
  }, [isBusy, save.status, selection, step, submit]);

  const goBack = useCallback(() => {
    // Never out from under a commit: the bytes are moving and the step behind
    // this one can change the file they came from.
    if (isBusy || save.status === "saved") return;
    if (!uploadsFile || step !== "align") return;
    setStep("file");
  }, [isBusy, save.status, step, uploadsFile]);

  return {
    steps,
    step,
    stepIndex,
    file,
    selection,
    alignment,
    setAlignment,
    confirmedText,
    setConfirmedText,
    trim,
    setTrim,
    trimWindowFor: deps.trimWindow,
    expectedActive,
    save,
    isBusy,
    canContinue,
    goNext,
    goBack,
    submit,
    cancel,
  };
}
