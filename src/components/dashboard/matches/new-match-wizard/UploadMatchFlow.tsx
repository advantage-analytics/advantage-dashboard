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
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, CircleX } from "lucide-react";
import {
  Step,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  CONTINUE_LABEL,
  type EventPreset,
} from "./types";
import {
  useUploadMatchWizard,
  type MatchSubject,
  type RosterOption,
  type VideoUploadEvent,
  type VideoUploadProgress,
} from "./useUploadMatchWizard";
import {
  formatFileSize,
  formatHoursMinutes,
  formatTransferSpeed,
} from "./utils";
import { formatEta } from "@/lib/data/match-analysis";
import { usageFraction } from "@/lib/data/usage-format";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { usePublishHeaderStatus } from "@/components/dashboard/header-status";
import { StepIndicator } from "./StepIndicator";
import { ProviderContent } from "./ProviderContent";
import { PinnedMatchContent } from "./PinnedMatchContent";
import { UploadContent } from "./UploadContent";
import { VideoStepContent } from "./VideoStepContent";
import { DetailsContent } from "./DetailsContent";
import { ConfirmContent } from "./ConfirmContent";
import { primaryBtnCls, ghostBtnCls } from "./styles";

/** Where the flow returns to when it is dismissed or finished. */
const PERSONAL_EXIT_HREF = "/dashboard/matches";

/** The design's column: 780px of content inside 56px gutters. */
const CONTENT_CLS = "mx-auto w-full max-w-[780px] px-14";

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

export function UploadMatchFlow({ preset }: { preset?: EventPreset | null } = {}) {
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
      preset={preset ?? null}
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
          <Button onClick={onUploadAnother} className={ghostBtnCls}>
            Upload another
          </Button>
          <Button asChild className={primaryBtnCls}>
            <Link href={exitHref}>
              {preset?.kind === "single"
                ? "Open the match"
                : preset
                  ? "Back to the event"
                  : "Back to matches"}
            </Link>
          </Button>
        </div>

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
 * Advisory: `reserve_processing_quota()` is the authority and refuses at submit
 * time. It reads two ways depending on whether there is a window to price yet —
 * before a trim it is the allowance you have, after one it is what this video
 * costs out of it. One ring cannot mean both at once, so the caption says which.
 */
function QuotaMeter({
  remainingSeconds,
  capSeconds,
  resetsOn,
  selectedSeconds,
}: {
  remainingSeconds: number;
  capSeconds: number;
  resetsOn: string;
  selectedSeconds?: number;
}) {
  const CIRCUMFERENCE = 2 * Math.PI * 6;
  const priced = selectedSeconds !== undefined && selectedSeconds > 0;
  const fraction = priced
    ? // Share of what is LEFT that this video eats — "1h 12m for this video"
      // reads against the remainder, not the cap. An empty remainder is a full
      // ring rather than a divide-by-zero.
      remainingSeconds > 0
      ? usageFraction(selectedSeconds, remainingSeconds)
      : 1
    : usageFraction(remainingSeconds, capSeconds);
  const arc = fraction * CIRCUMFERENCE;

  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 -rotate-90">
        <circle cx="8" cy="8" r="6" fill="none" stroke="#F3F3F3" strokeWidth="3" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="3"
          strokeDasharray={`${arc} ${CIRCUMFERENCE - arc}`}
        />
      </svg>
      <span className="mono tabular text-[11px]" style={{ color: "#525252" }}>
        {formatHoursMinutes(priced ? selectedSeconds! : remainingSeconds)}
      </span>
      <span className="whitespace-nowrap text-[11px] text-[#888888]">
        {priced ? (
          <>
            for this video ·{" "}
            <span className="mono tabular">
              {formatHoursMinutes(Math.max(0, remainingSeconds - selectedSeconds!))}
            </span>{" "}
            left after
          </>
        ) : (
          <>
            of {formatHoursMinutes(capSeconds)} left · resets {resetsOn}
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Who played this match — a team workspace's one extra question on step 1,
 * asked only when no preset already answered it.
 *
 * Every row carries its own id and the id travels with the CLICK, never the
 * text: `matches.player1_id` is half the SELECT policy on `matches`, so a
 * wrong id is not a mislabelled row — it hands read access to the wrong
 * person and silently attributes every statistic to them. "Myself" writes the
 * uploader's login id, which is exactly what the wizard wrote before this
 * control existed; a roster row writes that profile's `program_players.id`,
 * the same id the PinnedMatchContent picker hands the single-match rail.
 */
function WhoPlayedPicker({
  roster,
  uploaderName,
  subject,
  onChoose,
}: {
  roster: RosterOption[] | null;
  uploaderName: string | null;
  subject: MatchSubject | null;
  onChoose: (subject: MatchSubject) => void;
}) {
  const rowCls = (chosen: boolean) =>
    `flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] border px-3.5 py-2.5 text-left transition-colors duration-150 ${
      chosen
        ? "border-[#3B82F6] bg-[rgba(59,130,246,0.06)]"
        : "border-[#EAECF0] hover:bg-[#FAFAFA]"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-medium text-[#0D0D0D]">
          Who played this match?
        </h2>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-[#525252]">
          Stats and season records follow the player, not whoever uploads.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Who played this match"
        className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto"
      >
        <button
          type="button"
          role="radio"
          aria-checked={subject?.kind === "self"}
          onClick={() => onChoose({ kind: "self" })}
          className={rowCls(subject?.kind === "self")}
        >
          <span className="flex-1 text-[13px] text-[#0D0D0D]">
            {uploaderName ? `Myself — ${uploaderName}` : "Myself"}
          </span>
          {subject?.kind === "self" && (
            <Check className="size-3.5 shrink-0 text-[#3B82F6]" strokeWidth={2} />
          )}
        </button>

        {roster === null ? (
          <span className="px-3.5 py-2 text-[12px] text-[#888888]">
            Loading the roster…
          </span>
        ) : roster.length === 0 ? (
          <span className="px-3.5 py-2 text-[12px] text-[#888888]">
            Nobody else is on this program&rsquo;s roster yet.
          </span>
        ) : (
          roster.map((player) => {
            const chosen =
              subject?.kind === "roster" && subject.playerId === player.playerId;
            return (
              <button
                key={player.playerId}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() =>
                  onChoose({
                    kind: "roster",
                    playerId: player.playerId,
                    name: player.name,
                  })
                }
                className={rowCls(chosen)}
              >
                <span className="flex-1 text-[13px] text-[#0D0D0D]">
                  {player.name}
                </span>
                {player.ladderPosition !== null && (
                  <span className="text-[10px] uppercase tracking-[1px] text-[#888888]">
                    S{player.ladderPosition}
                  </span>
                )}
                {chosen && (
                  <Check
                    className="size-3.5 shrink-0 text-[#3B82F6]"
                    strokeWidth={2}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
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
}: {
  onCreated: (matchId: string) => void;
  onVideoUpload: (event: VideoUploadEvent) => void;
  exitHref: string;
  preset: EventPreset | null;
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
    handleVideoContinue,
    handleMatchContinue,
    handleBack,
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
    pendingDetailFocus,
    goEditDetail,
    consumePendingDetailFocus,
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
    requirementChips,
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
  } = useUploadMatchWizard({
    open: true,
    onOpenChange: handleOpenChange,
    onCreated: handleCreated,
    onVideoUpload,
    preset,
  });

  const contentRef = useRef<HTMLDivElement>(null);

  // Every keystroke on the later steps is already written to localStorage, and
  // the flow resumes from it. Saying so in the header is what makes leaving the
  // page feel survivable. Not on step 1, where there is nothing to lose yet.
  usePublishHeaderStatus(step === "provider" ? null : "Draft saved");

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(true);
    },
    [setIsOver]
  );
  const onDragLeave = useCallback(() => setIsOver(false), [setIsOver]);

  // Stable so memo(VideoStepContent) can actually skip renders — an inline
  // arrow here made its shallow compare fail on every parent render.
  const onVideoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(false);
      onVideoPick(e.dataTransfer.files?.[0] ?? null);
    },
    [setIsOver, onVideoPick]
  );

  const continueHandler =
    step === "provider" ? handleProviderContinue
    : step === "video" ? handleVideoContinue
    : step === "match" ? handleMatchContinue
    : handleCreateMatch;

  const currentStepIndex = stepOrder.indexOf(step);
  const { title, description } = {
    ...STEP_CONFIG[step],
    ...(isProcessingProvider ? STEP_CONFIG_PROCESSING[step] : undefined),
    // A pinned line changes what step 1 asks, so it has to change what step 1
    // is called. "Choose your data source" above a match that is already chosen
    // is the heading contradicting the panel underneath it.
    ...(preset && step === "provider"
      ? preset.kind === "single"
        ? {
            title: "Whose match is this?",
            description:
              "The one question the personal wizard can't answer in a team workspace. Everything else — opponent, date, surface, score — is the details step, unchanged.",
          }
        : {
            title: "Which match is this?",
            description:
              "The event answered everything but the video. Check it, then add the file.",
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
    if (!formData.eventName.trim()) labels.push("name");
    if (isProcessingProvider) {
      if (!formData.playerName.trim())
        labels.push(
          whoPlayed.subject?.kind === "roster" ? "player name" : "your name"
        );
      if (!formData.opponentName.trim()) labels.push("opponent");
      if (!hasAnySetScore) labels.push("score");
      if (formData.adScoring === undefined) labels.push("scoring");
      if (formData.fixedCamera === undefined) labels.push("camera");
      if (formData.initialTopPlayerIsPlayer1 === undefined) labels.push("your position at video start");
    }
    // Confirm has its own sentence for the case where only the camera answers
    // are outstanding, so the shape is decided here beside the list rather than
    // re-derived from label strings three hundred lines away.
    const onlyVideoAnswers =
      labels.length > 0 && labels.every((l) => l === "camera" || l === "your position at video start");
    return { labels, onlyVideoAnswers };
  }, [
    formData.eventName,
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
    provider: !selectedProvider
      ? "Make a selection"
      : // The one team-workspace question. Continue is refused in the hook
        // too; this is the sentence that says why.
        whoPlayed.required && !whoPlayed.subject
      ? "Choose who played this match"
      : null,
    video: isProbing
      ? "Checking your video…"
      : !uploadedFile
      ? "Drop or browse a video"
      : trimSelected < minTrimSeconds
      ? "Widen the trim window"
      : null,
    match: !uploadedFile
      ? "Drop or browse a file"
      : isUploading
      ? "Validating file…"
      : null,
    confirm: isCreating ? "Creating match…" : null,
  };

  const stepBusy = busyLabel[step];
  // Both of the last two steps can see the same answers, so both wait on them.
  const gatedByMissing =
    (step === "match" || step === "confirm") && missing.labels.length > 0;
  // Step 1 on the single rail waits for a player. It is the one fact the
  // workspace cannot supply, and a match created without it belongs to nobody.
  const awaitingPlayer =
    preset?.kind === "single" &&
    step === "provider" &&
    !formData.playerName.trim();
  const continueDisabled = stepBusy !== null || gatedByMissing || awaitingPlayer;

  // Platform detection for the right modifier glyph in the footer hint. Gated
  // behind null until mounted so SSR doesn't render a Mac chord on a Linux box.
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    const platform =
      // @ts-expect-error - userAgentData is widely supported but not yet in lib.dom
      navigator.userAgentData?.platform ?? navigator.platform ?? "";
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(platform));
  }, []);

  // Tracks whether focus currently lives inside a form control. Drives the
  // footer hint swap — when the user is mid-typing, plain Enter is suppressed
  // so we surface ⌘/Ctrl↵ instead.
  const [focusInForm, setFocusInForm] = useState(false);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setFocusInForm(isFormControl(e.target));
    const onFocusOut = () => setFocusInForm(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

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

      if (e.key === "Escape" && step !== "provider") {
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
  }, [continueDisabled, continueHandler, step, handleBack]);

  return (
    <div className="flex min-h-[calc(100vh-44px)] flex-col">
      {/* Full-bleed under the app header. Inside the content column it read as
          a rule belonging to the title; spanning the pane it reads as chrome
          measuring the whole flow. */}
      <StepIndicator currentStep={currentStepIndex} totalSteps={progressTotalSteps} />

      <div className={`${CONTENT_CLS} pb-10 pt-[26px]`}>
        {/* Confirm opens on the match's own hero — a heading above it would
            say less than the name already does. */}
        {step !== "confirm" && (
          <>
            <h1 className="text-[24px] font-light leading-[30px] tracking-[-0.5px] text-[#1D1D1F]">
              {title}
            </h1>
            <p className="mt-1.5 max-w-[460px] text-[12px] leading-[1.5] text-[#525252]">
              {description}
            </p>
          </>
        )}

        <div
          ref={contentRef}
          key={step}
          className={`animate-fadeIn ${step === "confirm" ? "" : "mt-7"}`}
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
            ) : whoPlayed.required ? (
              // A team workspace with no preset gets the personal wizard's
              // source question PLUS the one thing the workspace cannot infer:
              // whose match this is. The preset flows never reach this branch —
              // a line already knows, and the single rail asks via
              // PinnedMatchContent above.
              <div className="flex flex-col gap-9">
                <ProviderContent
                  selectedProvider={selectedProvider}
                  onProviderSelect={handleProviderSelect}
                />
                <WhoPlayedPicker
                  roster={whoPlayed.roster}
                  uploaderName={whoPlayed.uploaderName}
                  subject={whoPlayed.subject}
                  onChoose={whoPlayed.choose}
                />
              </div>
            ) : (
              <ProviderContent
                selectedProvider={selectedProvider}
                onProviderSelect={handleProviderSelect}
              />
            ))}

          {step === "video" && (
            <VideoStepContent
              videoFile={uploadedFile?.file ?? null}
              probe={videoProbe}
              warnings={videoWarnings}
              isProbing={isProbing}
              error={uploadError}
              startSeconds={formData.videoStartSeconds}
              endSeconds={formData.videoEndSeconds}
              isOver={isOver}
              minTrimSeconds={minTrimSeconds}
              acceptString={acceptString}
              requirementChips={requirementChips}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onVideoDrop}
              onPick={onVideoPick}
              onTrimChange={handleTrimChange}
              onRemove={handleRemoveVideo}
            />
          )}

          {step === "match" && (
            <div className="flex flex-col gap-6">
              {/* Processing providers picked their video on the previous step,
                  so this step is metadata only — including the two camera
                  answers, which sit in the details grid rather than above it. */}
              {!isProcessingProvider && (
                <UploadContent
                  selectedProvider={selectedProvider}
                  uploadedFile={uploadedFile}
                  isOver={isOver}
                  isUploading={isUploading}
                  uploadError={uploadError}
                  parsingState={parsingState}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={handleDrop}
                  onFileChange={handleFileChange}
                  onRemoveFile={handleRemoveFile}
                />
              )}
              {uploadedFile && !parsingState.isParsing && (
                <DetailsContent
                  formData={formData}
                  playerNameLabel={
                    whoPlayed.subject?.kind === "roster"
                      ? "Player name"
                      : undefined
                  }
                  showOpponentProgram={workspaces.active.kind === "team"}
                  onInputChange={handleInputChange}
                  onScoreChange={handleScoreChange}
                  onTiebreakChange={handleTiebreakChange}
                  isProcessingProvider={isProcessingProvider}
                  pendingDetailFocus={pendingDetailFocus}
                  onPendingDetailFocusConsumed={consumePendingDetailFocus}
                />
              )}
            </div>
          )}

          {step === "confirm" && (
            <ConfirmContent
              formData={formData}
              uploadedFile={uploadedFile}
              error={error}
              onEditDetail={goEditDetail}
              isProcessingProvider={isProcessingProvider}
              sourceDurationSeconds={videoProbe?.durationSeconds}
            />
          )}
        </div>
      </div>

      {/* Footer sticks to the bottom of the viewport so the primary action is
          reachable without scrolling to the end of a long form.

          White on a hairline, matching the app header rather than the tinted
          bar this had while it was a dialog footer. In a dialog the tint
          separated the action row from the body; on a page it was a full-bleed
          grey band under a centred column, weighted to nothing in the
          composition. The header is the only other persistent chrome in the
          dashboard and it is white, so this follows it. The border is
          unconditional where the header's is scroll-triggered: the header at
          scroll-top is genuinely part of the page, while an action bar is
          always chrome and should always be delineated. */}
      <div className="sticky bottom-0 mt-auto border-t border-[#F3F3F3] bg-white">
        <div className={`${CONTENT_CLS} flex h-16 items-center gap-3.5`}>
          {currentStepIndex > 0 ? (
            <Button onClick={handleBack} className={ghostBtnCls}>
              Back
            </Button>
          ) : (
            /* The frames leave this slot empty on step 1. Kept, because Esc is
               deliberately inert there and the breadcrumb is not obviously an
               exit — without it the flow has no way out that looks like one. */
            <Button asChild className={ghostBtnCls}>
              <Link href={exitHref}>Cancel</Link>
            </Button>
          )}

          {stepBusy !== null ? (
            <span className="text-[11px] text-[#525252]">{stepBusy}</span>
          ) : gatedByMissing ? (
            step === "confirm" ? (
              <span className="text-[11px] text-[#525252]">
                Create waits on{" "}
                {missing.onlyVideoAnswers
                  ? "the video answers"
                  : missing.labels.join(" · ")}{" "}
                —{" "}
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-[#3B82F6] underline-offset-2 transition-colors duration-150 hover:text-[#2563EB] hover:underline"
                >
                  answer them on Match details
                </button>
              </span>
            ) : (
              <span className="whitespace-nowrap text-[11px] text-[#525252]">
                <span className="font-medium tabular-nums text-[#0D0D0D]">
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
            )
          ) : step === "confirm" && workspaces.available.length > 1 ? (
            /* Only when there is a choice to get wrong. `program_id` on the row
               follows this exact workspace, and the jobs route bills whichever
               one it names. */
            <span className="text-[11px] text-[#525252]">
              Creates in{" "}
              <span className="font-medium text-[#0D0D0D]">
                {workspaces.active.name}
              </span>
            </span>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
              <span>Press</span>
              {/* When focus is mid-form, plain Enter is suppressed so we surface
                  the chord users can still rely on. Platform-detected per
                  SKILL.md › Keyboard Shortcut Chip conventions: ⌘ on Mac
                  concatenates without `+`, Ctrl+ elsewhere. Render is gated
                  until isMac resolves to avoid SSR mismatches. */}
              <kbd
                aria-hidden="true"
                className="inline-block rounded bg-[#F0F0F0] px-1 py-0.5 text-[10px] font-medium leading-none text-[#AAAAAA]"
              >
                {focusInForm && isMac !== null ? (isMac ? "⌘↵" : "Ctrl+↵") : "↵"}
              </kbd>
              <span>
                {focusInForm
                  ? "to next field"
                  : step === "confirm"
                  ? "to create"
                  : "to continue"}
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Not on the source step: there is no video to price yet, and an
              allowance shown before a file is picked reads as a warning. */}
          {isProcessingProvider &&
            step !== "provider" &&
            remainingQuotaSeconds !== undefined && (
            <QuotaMeter
              remainingSeconds={remainingQuotaSeconds}
              capSeconds={quotaCapSeconds}
              resetsOn={quotaResetsOn}
              /* Only once there is a video to price. A resumed draft keeps its
                 trim window in localStorage but cannot keep the File, so the
                 handles alone would have the meter costing a video that is no
                 longer picked. */
              selectedSeconds={
                uploadedFile?.file && trimSelected > 0 ? trimSelected : undefined
              }
            />
          )}

          <Button
            onClick={continueHandler}
            disabled={continueDisabled}
            data-wizard-continue
            className={primaryBtnCls}
          >
            {isCreating ? "Creating…" : CONTINUE_LABEL[step]}
          </Button>
        </div>
      </div>
    </div>
  );
});
