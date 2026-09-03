"use client";

/**
 * UploadMatchFlow — full-page wizard shell for creating a match.
 *
 * Replaces the dialog shell that used to host these steps. The step components,
 * the step order and every piece of state still come from `useUploadMatchWizard`;
 * only the chrome differs. Two things the page gets that a fixed-height dialog
 * could not: the trim rail is as wide as the viewport allows, and finishing has
 * somewhere to land — a dialog can only close, so success was previously silent.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CircleX, ExternalLink } from "lucide-react";
import {
  Step,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  CONTINUE_LABEL,
  type EventPreset,
  type MatchDraft,
} from "./types";
import {
  useUploadMatchWizard,
  type VideoUploadEvent,
  type VideoUploadProgress,
} from "./useUploadMatchWizard";
import {
  formatFileSize,
  formatHoursCap,
  formatHoursTenths,
  formatTransferSpeed,
  saveFormDataToStorage,
  STORAGE_KEYS,
} from "./utils";
import { formatEta } from "@/lib/data/match-analysis";
import { usageFraction } from "@/lib/data/usage-format";
import { advButton } from "@/lib/ui/adv-button";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { usePublishHeaderStatus } from "@/components/dashboard/header-status";
import { StepIndicator } from "./StepIndicator";
import { SourceStepContent } from "./SourceStepContent";
import { PinnedMatchContent } from "./PinnedMatchContent";
import { FileStepContent } from "./FileStepContent";
import { TrimStepContent } from "./TrimStepContent";
import { DetailsStepContent } from "./DetailsStepContent";
import { PinnedLineBar } from "./PinnedLineBar";

/** Where the flow returns to when it is dismissed or finished. */
const PERSONAL_EXIT_HREF = "/dashboard/matches";

/** The design's column: 720px of content inside 56px gutters. */
const CONTENT_CLS = "mx-auto w-full max-w-[832px] px-14";

/**
 * The missing-field label for `initialTopPlayerIsPlayer1`, matching
 * DetailsContent's field label. One const because the string is both pushed
 * into the list and compared against — it has already been reworded once, and
 * a rename that misses the comparison silently breaks the "only the camera
 * answers are outstanding" sentence.
 */
const CAMERA_POSITION_LABEL = "your position at video start";

/**
 * What one upload is doing, owned HERE rather than in the wizard hook.
 *
 * The wizard unmounts the instant a match is created, but its upload closure
 * runs for up to a couple of hours afterwards. This component survives that, so
 * it is the only place the progress can live.
 */
interface UploadState {
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

/** One source for phase colour, so the label ink cannot disagree with the track. */
const PHASE_INK: Record<UploadState["phase"], string> = {
  uploading: "#3B82F6",
  // Uploaded but not yet handed over is still in motion, so it reads as action
  // rather than success — the green is reserved for the vendor accepting it.
  done: "#3B82F6",
  submitted: "#5DB955",
  submit_failed: "#E51837",
  cancelled: "#E51837",
  failed: "#E51837",
};

const PHASE_LABEL: Record<Exclude<UploadState["phase"], "uploading">, string> = {
  done: "Submitting…",
  submitted: "Submitted",
  submit_failed: "Not submitted",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function UploadMatchFlow({
  preset: initialPreset,
  draft,
}: { preset?: EventPreset | null; draft?: MatchDraft | null } = {}) {
  // The line this flow is filling. State rather than the prop because the
  // pinned bar's Change menu swaps it for another line of the same event
  // (design 10a) without leaving the page — the file already dropped stays.
  const [preset, setPreset] = useState<EventPreset | null>(
    initialPreset ?? draft?.preset ?? null
  );
  // A team upload came from a line and goes back to it. A personal one has the
  // matches list, which is where its match will appear.
  const EXIT_HREF = preset?.eventHref ?? PERSONAL_EXIT_HREF;
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  // Bumping this remounts the wizard, which is how "Upload another" gets a
  // clean hook rather than a hand-written reset that would drift from it.
  const [runId, setRunId] = useState(0);
  // Keyed by match, because uploads genuinely overlap: "Upload another" starts a
  // second transfer while the first is still moving bytes. A single slot meant
  // the second silently replaced the first on screen while both ran, and Cancel
  // only ever reached the newest one.
  const [uploads, setUploads] = useState<Map<string, UploadState>>(
    () => new Map()
  );

  const handleVideoUpload = useCallback((event: VideoUploadEvent) => {
    setUploads((prev) => {
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
        // Dropped, it left the card below with nothing to show and falling
        // through to "Sent for analysis." for a video that never moved a byte.
        // `"started"` is what carries the file name, so this entry has none.
        if (event.kind !== "failed") {
          // Every other kind follows a `"started"` and cannot arrive first.
          // Same Map identity, so an event we ignore does not re-render.
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
    });
  }, []);

  const active = [...uploads.values()];

  if (createdMatchId) {
    return (
      <UploadMatchSuccess
        uploads={active}
        exitHref={
          preset?.kind === "single"
            ? `/dashboard/team/schedule/single/${createdMatchId}`
            : EXIT_HREF
        }
        preset={preset ?? null}
        onUploadAnother={() => {
          setCreatedMatchId(null);
          // Settled entries only. Clearing everything would hide transfers that
          // are still running, which is exactly the bug this keying fixes.
          setUploads((prev) => {
            const next = new Map(prev);
            for (const [id, u] of next) if (u.phase !== "uploading") next.delete(id);
            return next;
          });
          setRunId((n) => n + 1);
        }}
      />
    );
  }

  return (
    <UploadMatchWizard
      key={runId}
      onCreated={setCreatedMatchId}
      onVideoUpload={handleVideoUpload}
      exitHref={EXIT_HREF}
      preset={preset}
      onSwitchPreset={setPreset}
      draft={draft ?? null}
    />
  );
}

function UploadMatchSuccess({
  uploads,
  onUploadAnother,
  exitHref,
  preset,
}: {
  uploads: UploadState[];
  onUploadAnother: () => void;
  exitHref: string;
  preset: EventPreset | null;
}) {
  const uploading = uploads.filter((u) => u.phase === "uploading");
  const problems = uploads.filter(
    (u) =>
      u.phase === "failed" ||
      u.phase === "cancelled" ||
      u.phase === "submit_failed"
  );
  const busy = uploading.length > 0 || uploads.some((u) => u.phase === "done");

  /**
   * Where a second upload starts when the first one is still moving.
   *
   * The same-tab remount cannot be used while a transfer is live: this screen is
   * the only thing holding the upload's progress and its cancel handle, so
   * replacing it with the wizard would leave bytes moving with nothing to watch
   * or stop them. A new tab keeps this one intact and starts a genuinely fresh
   * wizard beside it.
   *
   * The current URL rather than a hardcoded `/dashboard/matches/new`, because a
   * team upload's preset lives entirely in its own route and query string
   * (`/dashboard/team/upload?entry=…`, `/dashboard/team/schedule/new/single?match=…`).
   * Hardcoding the personal route would silently drop the pinned line.
   *
   * Read during render rather than through `usePathname`/`useSearchParams`:
   * the latter would force a Suspense boundary on an otherwise static route,
   * and this screen cannot hydrate-mismatch — `createdMatchId` starts null, so
   * this branch is only ever reached after a click, never on the server.
   *
   * No localStorage collision to resolve: `handleCreateMatch` calls
   * `clearStorageData()` before this screen ever renders, and this screen has no
   * wizard mounted to write the keys back — so the new tab loads a blank draft,
   * and `DashboardShell`'s "leaving the flow" clear is a no-op in a tab that is
   * arriving at the flow rather than leaving it.
   */
  const newTabHref =
    typeof window === "undefined"
      ? "/dashboard/matches/new"
      : window.location.pathname + window.location.search;

  return (
    <div className={`${CONTENT_CLS} pb-16 pt-10`}>
      <div className="animate-fadeIn flex flex-col items-center gap-3 rounded-[14px] border border-[#F3F3F3] bg-white px-10 py-12 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{
            background:
              problems.length > 0 && !busy
                ? "rgba(229,24,55,0.08)"
                : "rgba(59,130,246,0.08)",
          }}
        >
          {problems.length > 0 && !busy ? (
            <CircleX className="size-4.5 text-[#E51837]" strokeWidth={1.5} />
          ) : (
            <Check className="size-4.5 text-[#3B82F6]" strokeWidth={1.5} />
          )}
        </div>

        <h1 className="text-[24px] font-light tracking-[-0.5px] text-[#1D1D1F]">
          Match saved.
        </h1>

        {/* The match row is committed either way. Only the video transfer is in
            doubt, so the headline never changes and this line carries the state. */}
        <p className="max-w-[440px] text-center text-[12px] leading-[1.5] text-[#525252]">
          {busy
            ? uploading.length > 1
              ? `Keep this tab open until all ${uploading.length} videos finish. The matches themselves are already safe.`
              : "Keep this tab open until the video finishes. The match itself is already safe."
            : problems.length > 0
            ? problems[0].error ??
              (problems[0].phase === "submit_failed"
                ? "Your video is stored, but it could not be sent for analysis."
                : "The video upload did not finish.")
            : "Sent for analysis. Results are added as soon as they're ready."}
        </p>

        {/* Prominent keep-open warning — body-size text so it cannot be missed.
            Only shown while at least one upload is actively transferring bytes.
            The footnote below this block covers the navigation nuance for
            readers who want the fine print. */}
        {uploading.length > 0 && (
          <div className="flex w-full max-w-[440px] items-start gap-2.5 rounded-[8px] border border-[#FEF3C7] bg-[#FFFBEB] px-3.5 py-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-[#D97706]"
              strokeWidth={1.5}
            />
            <p className="text-[13px] leading-[1.5] text-[#92400E]">
              Keep this tab open —{" "}
              {uploading.length > 1
                ? "your videos are uploading"
                : "your video is uploading"}
              . You can navigate within the app, but closing this tab will
              stop the upload.
            </p>
          </div>
        )}

        {/* One row per transfer. Everything here comes from the browser's own
            XHR progress, so it moves continuously rather than at the
            once-a-minute cadence of the database heartbeat. */}
        {uploads.length > 0 && (
          <ul className="mt-4 flex w-full max-w-[440px] flex-col gap-4">
            {uploads.map((u) => (
              <li key={u.matchId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate text-[#525252]">{u.fileName}</span>
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: PHASE_INK[u.phase] }}
                  >
                    {u.phase === "uploading"
                      ? `${(u.progress?.pct ?? 0).toFixed(1)}%`
                      : PHASE_LABEL[u.phase]}
                  </span>
                </div>

                <AnalysisProgressTrack
                  percent={
                    u.phase === "uploading" ? u.progress?.pct ?? 0 : 100
                  }
                  // `done` keeps the sheen: bytes have landed but the job is
                  // still being handed over, and a still bar would read as
                  // finished.
                  live={u.phase === "uploading" || u.phase === "done"}
                  tone={PHASE_INK[u.phase]}
                  label={`${u.fileName} ${u.phase}`}
                />

                {u.phase === "uploading" && u.progress && (
                  <div className="flex items-baseline justify-between text-[11px] text-[#AAAAAA] tabular-nums">
                    <span>
                      {formatFileSize(u.progress.bytesUploaded)} /{" "}
                      {formatFileSize(u.progress.bytesTotal)}
                    </span>
                    <span>
                      {formatTransferSpeed(u.progress.speed)} ·{" "}
                      {formatEta(u.progress.etaSeconds)}
                    </span>
                  </div>
                )}

                {u.phase === "uploading" && u.cancel && (
                  <button
                    type="button"
                    onClick={u.cancel}
                    className="self-start text-[11px] text-[#888888] underline-offset-2 transition-colors duration-200 hover:text-[#E51837] hover:underline"
                  >
                    Cancel this upload
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex gap-2">
          {/* A real anchor, not `window.open`: it survives a popup blocker,
              honours ⌘-click and middle-click, and announces the new tab to a
              screen reader. Plain `<a>` rather than `<Link>` on purpose — the
              new tab must be a full page load, which is what gives its wizard a
              hook with no memory of this one. */}
          {busy ? (
            <a
              href={newTabHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Upload another match — opens in a new tab"
              className={advButton("ghost", "md")}
            >
              Upload another
              <ExternalLink
                className="size-3.5 shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </a>
          ) : (
            <button type="button" onClick={onUploadAnother} className={advButton("ghost", "md")}>
              Upload another
            </button>
          )}
          <Link href={exitHref} className={advButton("primary", "md")}>
            {preset?.kind === "single"
              ? "Open the match"
              : preset
                ? "Back to the event"
                : "Back to matches"}
          </Link>
        </div>

        {/* Beside the button that causes it. The amber banner above says to keep
            the tab open; this says why the button just handed them a second one,
            so the two tabs don't read as an accident. The stop/leave nuance is
            the footnote below — repeating it here would be the third telling. */}
        {busy && (
          <p className="max-w-[440px] text-center text-[11px] leading-[1.5] text-[#888888]">
            &ldquo;Upload another&rdquo; opens a new tab. Don&rsquo;t close this
            one —{" "}
            {uploading.length === 0
              ? // Bytes have landed; the vendor hand-off is still in flight, and
                // it runs from this tab too.
                "this upload is still finishing here"
              : uploading.length > 1
              ? "your videos are still uploading here"
              : "your video is still uploading here"}
            .
          </p>
        )}

        {/* Leaving is allowed but not free, and the browser's own dialog fires
            too late to read as a warning. */}
        {/* Precise on purpose. beforeunload only fires on a real unload, so
            closing the tab stops the transfer but the "Back to matches" link
            directly above does not — it keeps running, just without this screen
            or its cancel button. The old line claimed leaving cancelled it,
            which was wrong in both directions. */}
        {busy && (
          <p className="mt-1 text-center text-[10px] uppercase tracking-[2px] text-[#CCCCCC]">
            Closing this tab stops {uploading.length > 1 ? "them" : "it"} · leaving this page does not
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Does this element own its own Enter key?
 *
 * Used by both the footer hint (which swaps to the chord while you are typing)
 * and the Enter handler (which must not submit out from under a form control).
 * One rule, because two shapes of it in one file is how they drift.
 */
function isFormControl(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable ||
    node.getAttribute("role") === "combobox"
  );
}

/**
 * The monthly allowance, in the footer beside the primary action.
 *
 * Cancel · divider · 3px bar in `--viz-you-mid` with the mono readout. It
 * appears only where hours are spent and states the cost of the file in hand:
 * before a file it is the allowance you have, after one it is what this video
 * spends out of it — the pending hours drawn as a lighter `--viz-you-light`
 * segment after the used ones. Advisory — `reserve_processing_quota()` is the
 * authority and refuses at submit time.
 */
function FooterMeter({
  remainingSeconds,
  capSeconds,
  selectedSeconds,
  suffix,
}: {
  remainingSeconds: number;
  capSeconds: number;
  selectedSeconds?: number;
  /** "resets on the 1st" for a personal allowance, "team hours" for a program's. */
  suffix: string;
}) {
  const priced = selectedSeconds !== undefined && selectedSeconds > 0;
  const usedSeconds = Math.max(0, capSeconds - remainingSeconds);
  const usedFraction = usageFraction(usedSeconds, capSeconds);
  // The bar draws what will have been spent once the match is saved, so a
  // priced video moves it before the job does — as its own segment, so the
  // cost can be told from the balance.
  const pendingFraction = priced
    ? Math.max(0, usageFraction(usedSeconds + selectedSeconds, capSeconds) - usedFraction)
    : 0;
  const cap = formatHoursCap(capSeconds);

  return (
    <span className="ml-3 inline-flex items-center gap-2.5 border-l border-[var(--border-medium)] pl-4">
      <span
        role="img"
        aria-label={
          priced
            ? `${formatHoursTenths(usedSeconds)} of ${cap} hours used, ${formatHoursTenths(selectedSeconds)} pending`
            : `${formatHoursTenths(usedSeconds)} of ${cap} hours used`
        }
        className="inline-flex h-[3px] w-14 shrink-0 overflow-hidden rounded-[2px] bg-[var(--ink-100)]"
      >
        <span
          className="h-full shrink-0 bg-[var(--viz-you-mid)] transition-[width] duration-300 ease-[var(--ease-chart)]"
          style={{ width: `${usedFraction * 100}%` }}
        />
        <span
          className="h-full shrink-0 bg-[var(--viz-you-light)] transition-[width] duration-300 ease-[var(--ease-chart)]"
          style={{ width: `${pendingFraction * 100}%` }}
        />
      </span>
      <span className="mono tabular whitespace-nowrap text-[11px] text-[var(--ink-500)]">
        {priced
          ? `Spends ${formatHoursTenths(selectedSeconds)} h · ${formatHoursTenths(
              Math.max(0, remainingSeconds - selectedSeconds)
            )} of ${cap} h left after`
          : `${formatHoursTenths(remainingSeconds)} of ${cap} h left · ${suffix}`}
      </span>
    </span>
  );
}

/**
 * Memoized, and not for tidiness.
 *
 * After "Upload another" this is the rendered branch while transfers are still
 * running, and every XHR progress event sets state on the parent — ~20/s per
 * upload, reconciling this subtree (DetailsContent alone is >1,200 lines and is
 * not memoized) to produce nothing visible, because the screen showing progress
 * is unmounted. Both props are stable, so this bails on every one of them.
 */
const UploadMatchWizard = memo(function UploadMatchWizard({
  onCreated,
  onVideoUpload,
  exitHref,
  preset,
  onSwitchPreset,
  draft,
}: {
  onCreated: (matchId: string) => void;
  onVideoUpload: (event: VideoUploadEvent) => void;
  exitHref: string;
  preset: EventPreset | null;
  onSwitchPreset: (next: EventPreset) => void;
  draft: MatchDraft | null;
}) {
  const router = useRouter();
  // Which workspace this match will be created in, and billed against.
  const workspaces = useWorkspace();

  // `onOpenChange(false)` fires both when the user backs out and when a match
  // is committed. onCreated lands first in the success path, so this ref tells
  // the two apart without the hook needing to know it is on a page.
  const createdRef = useRef(false);
  const handleCreated = useCallback(
    (matchId: string) => {
      createdRef.current = true;
      onCreated(matchId);
    },
    [onCreated]
  );
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !createdRef.current) router.push(exitHref);
    },
    [router, exitHref]
  );

  const {
    step,
    selectedProvider,
    uploadedFile,
    isOver,
    isCreating,
    isUploading,
    error,
    uploadError,
    formData,
    parsingState,
    handleProviderSelect,
    handleProviderContinue,
    handleFileContinue,
    handleTrimContinue,
    handleBack,
    firstStep,
    attachedLine,
    attachLine,
    detachLine,
    saveDraft,
    draftSaving,
    lastChangedAt,
    setIsOver,
    handleDrop,
    handleFileChange,
    handleRemoveFile,
    handleInputChange,
    setPickedPlayerUserId,
    whoPlayed,
    handleScoreChange,
    handleTiebreakChange,
    handleCreateMatch,
    stepOrder,
    progressTotalSteps,
    isProcessingProvider,
    videoProbe,
    videoWarnings,
    isProbing,
    minTrimSeconds,
    remainingQuotaSeconds,
    quotaCapSeconds,
    quotaResetsOn,
    acceptString,
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
  } = useUploadMatchWizard({
    open: true,
    onOpenChange: handleOpenChange,
    onCreated: handleCreated,
    onVideoUpload,
    preset,
    draft,
  });

  const contentRef = useRef<HTMLDivElement>(null);

  // Saving a draft is a fact, not an event: the wizard autosaves as you answer
  // and says so in the header's status slot — the same slot that later carries
  // the upload. The timestamp appears once you have been idle a minute;
  // "Saving…" only while a draft row is genuinely in flight (design 11c).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const idleMinutes = lastChangedAt ? Math.floor((now - lastChangedAt) / 60_000) : 0;
  usePublishHeaderStatus(
    draftSaving
      ? "Saving…"
      : idleMinutes >= 1
        ? `Draft saved · ${idleMinutes} min ago`
        : "Draft saved"
  );

  /**
   * Leave with the draft intact.
   *
   * The wizard was already saving; this writes the draft row the Matches
   * table lists with Resume, pins the chosen source so the next visit resumes
   * past step 1, and sets the flag that stops `DashboardShell` clearing
   * storage on the way out. Then it goes where Cancel would.
   */
  const handleSaveDraft = useCallback(async () => {
    saveFormDataToStorage(formData);
    if (selectedProvider) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PROVIDER, selectedProvider);
    }
    localStorage.setItem(STORAGE_KEYS.DRAFT_KEPT, "1");
    await saveDraft();
    router.push(exitHref);
  }, [formData, selectedProvider, saveDraft, router, exitHref]);

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(true);
    },
    [setIsOver]
  );
  const onDragLeave = useCallback(() => setIsOver(false), [setIsOver]);

  // Stable so memo(FileStepContent) can actually skip renders — an inline
  // arrow here made its shallow compare fail on every parent render.
  const onVideoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(false);
      onVideoPick(e.dataTransfer.files?.[0] ?? null);
    },
    [setIsOver, onVideoPick]
  );
  const onVideoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onVideoPick(e.target.files?.[0] ?? null);
      // So picking the same file again after Remove still fires a change.
      e.target.value = "";
    },
    [onVideoPick]
  );

  // The two camera answers, from the trim step. Booleans only — the fields
  // start undefined and nothing here may default them.
  const onCameraAnswer = useCallback(
    (field: "fixedCamera" | "initialTopPlayerIsPlayer1", value: boolean) => {
      handleInputChange(field, value);
    },
    [handleInputChange]
  );

  /**
   * Whose match this is, for "Drop Marcus's video here" and "Marcus at the
   * start". Null when it is the uploader's own — the copy then says "your"
   * and "You". A first name, because the sentence is spoken, not filed.
   */
  const subjectFirstName = useMemo(() => {
    const name =
      whoPlayed.subject?.kind === "roster"
        ? whoPlayed.subject.name
        : preset
          ? formData.playerName
          : "";
    return name.trim().split(/\s+/)[0] || null;
  }, [whoPlayed.subject, preset, formData.playerName]);

  const continueHandler =
    step === "provider" ? handleProviderContinue
    : step === "file" ? handleFileContinue
    : step === "trim" ? handleTrimContinue
    : handleCreateMatch;

  const currentStepIndex = stepOrder.indexOf(step);
  const line = preset?.kind === "line" ? preset : null;
  const { title, description } = {
    ...STEP_CONFIG[step],
    ...(isProcessingProvider ? STEP_CONFIG_PROCESSING[step] : undefined),
    // A single match in a team workspace changes what step 1 asks, so it has
    // to change what step 1 is called.
    ...(preset?.kind === "single" && step === "provider"
      ? {
          title: "Whose match is this?",
          description:
            "The one question the personal wizard can't answer in a team workspace. Everything else — opponent, date, surface, score — is the details step, unchanged.",
        }
      : undefined),
    // When the slot was the starting point there is nothing to offer, so the
    // title tells the truth of the step: the score is the only thing left to
    // type, and the subline credits the lineup (design 7c).
    ...(line && step === "match"
      ? {
          title: "The score.",
          description: `${subjectFirstName ?? line.playerName}'s${
            line.round ? ` ${line.round}` : ""
          } line${line.eventName ? ` at ${line.eventName}` : ""} — the lineup filled the rest.`,
        }
      : undefined),
  };

  const trimSelected =
    (formData.videoEndSeconds ?? 0) - (formData.videoStartSeconds ?? 0);

  // Mirrors what buildSplitStepJobRequest() accepts: at least one set with a
  // game count above zero. Three sets of 0-0 is a well-formed payload that
  // describes a match nobody played, and the vendor would take it.
  const hasAnySetScore =
    formData.playerScores.some((n) => (n ?? 0) > 0) ||
    formData.opponentScores.some((n) => (n ?? 0) > 0);

  /**
   * What is still unanswered — a list, not the first offender.
   *
   * A video job's metadata is not optional the way an imported match's is:
   * every one of these is a REQUIRED field in the vendor's job payload
   * (`docs/ui-revamp-guardrails.md` §3.1), and a job that reaches them
   * incomplete is refused after the video has already uploaded. Blocking here
   * costs a click; blocking there costs an hour of transfer.
   *
   * Counting them out loud is the point: naming one at a time meant filling a
   * field, pressing Continue, and being told about the next one.
   *
   * Only for processing providers. A SwingVision import gets its scores and
   * names from the parsed file, so demanding them by hand would ask twice.
   */
  const missing = useMemo(() => {
    const labels: string[] = [];
    // The opponent, the score and the day are what every match needs; the
    // rest is the video job's.
    if (!formData.opponentName.trim()) labels.push("opponent");
    if (!hasAnySetScore) labels.push("score");
    if (!formData.date) labels.push("date");
    if (isProcessingProvider) {
      if (!formData.playerName.trim())
        labels.push(
          whoPlayed.subject?.kind === "roster" ? "player name" : "your name"
        );
      if (formData.adScoring === undefined) labels.push("scoring");
      if (formData.fixedCamera === undefined) labels.push("camera");
      if (formData.initialTopPlayerIsPlayer1 === undefined) labels.push(CAMERA_POSITION_LABEL);
    }
    // Confirm has its own sentence for the case where only the camera answers
    // are outstanding, so the shape is decided here beside the list rather than
    // re-derived from label strings three hundred lines away.
    const onlyVideoAnswers =
      labels.length > 0 && labels.every((l) => l === "camera" || l === CAMERA_POSITION_LABEL);
    return { labels, onlyVideoAnswers };
  }, [
    formData.date,
    formData.playerName,
    formData.opponentName,
    formData.adScoring,
    formData.fixedCamera,
    formData.initialTopPlayerIsPlayer1,
    hasAnySetScore,
    isProcessingProvider,
    whoPlayed.subject,
  ]);

  // Work in progress, per step. Separate from `missing` because these are
  // states to wait out rather than fields to fill, and they read differently.
  const busyLabel: Record<Step, string | null> = {
    // Step 1 says nothing in the footer: Continue sleeps at 40% until a source
    // and — in a team workspace — a player are chosen, and the fields themselves
    // are the sentence. The hook refuses Continue on the same two conditions.
    provider:
      !selectedProvider || (whoPlayed.required && !whoPlayed.subject) ? "" : null,
    // Steps 2 and 3 say nothing either: the zone, the row and the two
    // questions carry their own state, and Continue sleeps at 40% until a file
    // passes the check — and, on the trim step, until the window is wide
    // enough and both camera answers are given.
    file:
      !uploadedFile || isProbing || isUploading || parsingState.isParsing ? "" : null,
    trim:
      !uploadedFile?.file ||
      isProbing ||
      trimSelected < minTrimSeconds ||
      formData.fixedCamera === undefined ||
      formData.initialTopPlayerIsPlayer1 === undefined
        ? ""
        : null,
    match: !uploadedFile
      ? "Pick the file again on step 2"
      : isUploading
      ? "Validating file…"
      : isCreating
      ? "Saving…"
      : null,
  };

  const stepBusy = busyLabel[step];
  const gatedByMissing = step === "match" && missing.labels.length > 0;
  // Step 1 on the single rail waits for a player. It is the one fact the
  // workspace cannot supply, and a match created without it belongs to nobody.
  const awaitingPlayer =
    preset?.kind === "single" &&
    step === "provider" &&
    !formData.playerName.trim();
  const continueDisabled = stepBusy !== null || gatedByMissing || awaitingPlayer;

  // Keyboard:
  //   • Plain Enter advances the wizard when focus is outside form controls
  //     (so score-entry and dropdowns keep their native Enter semantics —
  //     focus chain in DetailsContent, opening selects, etc.).
  //   • ⌘/Ctrl+Enter advances *focus* to the next field — same idea as Tab,
  //     but reachable without the user having to retrain pinkies. Submitting
  //     the wizard is reserved for the explicit Continue button so a fast-typed
  //     chord can never skip a missed field.
  //   • Esc steps back when there's a previous step. On the first step it does
  //     nothing: leaving is a deliberate click, not a stray keypress.
  useEffect(() => {
    const focusNextField = () => {
      // Walk forward through the step content's tabbables. When the user runs
      // out of fields, fall through to the Continue button so the terminal
      // chord lands on submit instead of silently no-op'ing.
      const root = contentRef.current;
      if (!root) return;
      const list = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      const inFieldNext = list[idx + 1];
      if (inFieldNext) {
        inFieldNext.focus();
        // Select text inputs so the next keystroke replaces, matching the
        // behavior of tabbing into a numeric score cell.
        if (
          inFieldNext instanceof HTMLInputElement &&
          /text|number|search|email|url/i.test(inFieldNext.type || "text")
        ) {
          inFieldNext.select();
        }
        return;
      }
      // Walked past the last field — hand focus to Continue with a one-shot
      // ring pulse so the chord-to-submit handoff isn't silent.
      const cta = document.querySelector<HTMLElement>('[data-wizard-continue]:not([disabled])');
      if (!cta) return;
      cta.focus();
      cta.classList.remove("animate-chord-pulse");
      // Force a reflow so re-adding the class restarts the animation if it
      // was already mid-flight from a prior chord press.
      void cta.offsetWidth;
      cta.classList.add("animate-chord-pulse");
      const onEnd = () => {
        cta.classList.remove("animate-chord-pulse");
        cta.removeEventListener("animationend", onEnd);
      };
      cta.addEventListener("animationend", onEnd);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Cheapest test first: this listener sees EVERY keystroke on the page, and
      // only two keys can do anything below. Scanning the document for open
      // popovers before this check meant paying two full-document
      // querySelectors per character typed into the score boxes.
      if (e.key !== "Escape" && e.key !== "Enter") return;

      // An open menu owns the keyboard, and this runs in the CAPTURE phase to
      // find out. Radix dismisses its popovers from a document-level listener,
      // which fires before a window-level one — so by the time a bubble-phase
      // handler saw the event, aria-expanded had already flipped back to false
      // and Escape popped the wizard step as well as the menu it was aimed at.
      // Capturing means the question "is something open?" is asked while the
      // answer is still true, and the menu still gets its Escape afterwards.
      const active = document.activeElement as HTMLElement | null;
      if (
        active?.tagName === "SELECT" ||
        document.querySelector('[aria-expanded="true"]')
      ) {
        return;
      }

      if (e.key === "Escape" && step !== firstStep) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;

      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        focusNextField();
        return;
      }

      if (isFormControl(e.target)) return;
      if (continueDisabled) return;
      e.preventDefault();
      continueHandler();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [continueDisabled, continueHandler, step, firstStep, handleBack]);

  return (
    <div className="flex min-h-[calc(100vh-44px)] flex-col">
      {/* Full-bleed under the app header. Inside the content column it read as
          a rule belonging to the title; spanning the pane it reads as chrome
          measuring the whole flow. */}
      <StepIndicator currentStep={currentStepIndex} totalSteps={progressTotalSteps} />

      {/* Step 1, already answered: the line this flow is filling, pinned. */}
      {line && (
        <PinnedLineBar
          preset={line}
          onSwitch={onSwitchPreset}
          outsideHref="/dashboard/matches/new"
        />
      )}

      <div className={`${CONTENT_CLS} pb-10 pt-16`}>
        <div className="flex flex-col gap-3">
          <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
            Step {currentStepIndex + 1} of {progressTotalSteps}
          </span>
          <h1
            className="max-w-[560px] text-[30px] font-light leading-[1.15] tracking-[-0.3px] text-[var(--ink-900)]"
            style={{ textWrap: "pretty" }}
          >
            {title}
          </h1>
          <p
            className="max-w-[480px] text-[13px] leading-[1.55] text-[var(--ink-600)]"
            style={{ textWrap: "pretty" }}
          >
            {description}
          </p>
        </div>

        <div
          ref={contentRef}
          key={step}
          className={`animate-fadeIn ${step === "match" ? "mt-9" : "mt-[52px]"}`}
        >
          {step === "provider" &&
            (preset ? (
              // Same step, different question. In a team workspace "where do
              // the numbers come from?" has one answer, so this slot confirms
              // the destination instead of asking for a source.
              <PinnedMatchContent
                preset={preset}
                playerName={formData.playerName}
                onPickPlayer={(name, pickedUserId) => {
                  handleInputChange("playerName", name);
                  setPickedPlayerUserId(pickedUserId);
                }}
              />
            ) : (
              // Workspace · For · Source. In a personal workspace For is the
              // uploader; in a team workspace it is the one thing the
              // workspace cannot infer — whose match this is — and the hook
              // refuses Continue until it is answered. The preset flows never
              // reach this branch: a line already knows, and the single rail
              // asks via PinnedMatchContent above.
              <SourceStepContent
                selectedProvider={selectedProvider}
                onProviderSelect={handleProviderSelect}
                whoPlayed={whoPlayed}
              />
            ))}

          {/* Step 2 asks for one thing. The same component for both kinds;
              the handlers differ because a video is probed locally and an
              export is validated and read. */}
          {step === "file" && (
            <FileStepContent
              kind={isProcessingProvider ? "processing" : "import"}
              selectedProvider={selectedProvider}
              subjectFirstName={subjectFirstName}
              uploadedFile={uploadedFile}
              probe={videoProbe}
              warnings={isProcessingProvider ? videoWarnings : []}
              busy={isProbing || isUploading || parsingState.isParsing}
              error={uploadError}
              parsingState={parsingState}
              formData={formData}
              acceptString={acceptString}
              isOver={isOver}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={isProcessingProvider ? onVideoDrop : handleDrop}
              onFileChange={isProcessingProvider ? onVideoFileChange : handleFileChange}
              onRemove={isProcessingProvider ? handleRemoveVideo : handleRemoveFile}
            />
          )}

          {step === "trim" && (
            <TrimStepContent
              videoFile={uploadedFile?.file ?? null}
              probe={videoProbe}
              startSeconds={formData.videoStartSeconds}
              endSeconds={formData.videoEndSeconds}
              minTrimSeconds={minTrimSeconds}
              subjectFirstName={subjectFirstName}
              fixedCamera={formData.fixedCamera}
              initialTopPlayerIsPlayer1={formData.initialTopPlayerIsPlayer1}
              onTrimChange={handleTrimChange}
              onAnswer={onCameraAnswer}
            />
          )}

          {/* The file was dropped a step ago and, for an export, already read —
              so this step is the score, the players and the context, and Save
              match is the last thing on the page. */}
          {step === "match" && (
            <DetailsStepContent
              formData={formData}
              onInputChange={handleInputChange}
              onScoreChange={handleScoreChange}
              onTiebreakChange={handleTiebreakChange}
              isProcessingProvider={isProcessingProvider}
              workspaceKind={workspaces.active.kind === "team" ? "team" : "personal"}
              subject={{
                name: formData.playerName || whoPlayed.uploaderName || "You",
                isSelf: !preset && whoPlayed.subject?.kind !== "roster",
                playerId:
                  whoPlayed.subject?.kind === "roster"
                    ? whoPlayed.subject.playerId
                    : preset?.playerUserId ?? null,
                userId: workspaces.viewer.id,
              }}
              preset={preset}
              attachedLine={attachedLine}
              onAttach={attachLine}
              onDetach={detachLine}
              exportRead={parsingState.parseSuccess}
              error={error}
            />
          )}
        </div>
      </div>

      {/* Footer sticks to the bottom of the viewport so the primary action is
          reachable without scrolling to the end of a long form. 64px, white on
          a hairline, matching the app header: Cancel · divider · meter, then
          Save draft and Continue. It is the same on every step — only the
          meter comes and goes, and it sits left of the spacer so nothing else
          shifts when it does. */}
      <div className="sticky bottom-0 mt-auto border-t border-[var(--border-hairline)] bg-white">
        <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
          {step !== firstStep ? (
            <button
              type="button"
              onClick={handleBack}
              className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
            >
              Back
            </button>
          ) : (
            /* Esc is deliberately inert on step 1 and the breadcrumb is not
               obviously an exit — without this the flow has no way out that
               looks like one. */
            <Link
              href={exitHref}
              className="text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
            >
              Cancel
            </Link>
          )}

          {/* Only where hours are spent, and only once the allowance is known:
              an export costs nothing, and a bar that has to explain itself is
              a bar that shouldn't be there. */}
          {isProcessingProvider && remainingQuotaSeconds !== undefined && (
            <FooterMeter
              remainingSeconds={remainingQuotaSeconds}
              capSeconds={quotaCapSeconds}
              suffix={workspaces.active.kind === "team" ? "team hours" : "resets on the 1st"}
              /* Only once there is a video to price. A resumed draft keeps its
                 trim window in localStorage but cannot keep the File, so the
                 handles alone would have the meter costing a video that is no
                 longer picked. */
              selectedSeconds={
                uploadedFile?.file && trimSelected > 0 ? trimSelected : undefined
              }
            />
          )}

          {/* What the last step is still waiting on — a list, not the first
              offender. The earlier steps carry their own state on the page, so
              it says nothing there. */}
          {step === "match" &&
            (stepBusy ? (
              <span className="text-[11px] text-[var(--ink-500)]">{stepBusy}</span>
            ) : gatedByMissing ? (
              <span className="whitespace-nowrap text-[11px] text-[var(--ink-500)]">
                <span className="font-medium tabular-nums text-[var(--ink-900)]">
                  {missing.labels.length}
                </span>{" "}
                to go — {missing.labels.slice(0, 3).join(" · ")}
                {/* Naming all six wrapped this bar onto two lines and squeezed
                    the meter beside it. Three is enough to start on; the count
                    carries the rest, and the fields themselves are marked. */}
                {missing.labels.length > 3
                  ? ` +${missing.labels.length - 3} more`
                  : ""}
              </span>
            ) : workspaces.available.length > 1 ? (
              /* Only when there is a choice to get wrong. `program_id` on the
                 row follows this exact workspace, and the jobs route bills
                 whichever one it names. */
              <span className="text-[11px] text-[var(--ink-500)]">
                Saves in{" "}
                <span className="font-medium text-[var(--ink-900)]">
                  {workspaces.active.name}
                </span>
              </span>
            ) : null)}

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={draftSaving}
            className="cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors duration-150 hover:text-[var(--ink-900)] disabled:cursor-default"
          >
            {draftSaving ? "Saving…" : "Save draft"}
          </button>

          {/* Always present; asleep at the design system's disabled state
              (`advButton()`: opacity 0.5, no pointer) until the step's
              requirement is met. The same button as every other page-level
              CTA — "New match", "Create dual", "Create tournament" — so `md`,
              not the `sm` the row actions use, and no width of its own. */}
          <button
            type="button"
            onClick={continueHandler}
            disabled={continueDisabled}
            data-wizard-continue
            className={advButton("primary", "md")}
          >
            {isCreating ? "Saving…" : CONTINUE_LABEL[step]}
          </button>
        </div>
      </div>
    </div>
  );
});
