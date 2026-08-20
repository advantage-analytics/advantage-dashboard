"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CornerDownRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { advButton } from "@/lib/ui/adv-button";
import { recordResult } from "@/lib/schedule/actions";
import {
  createProcessingJob,
  uploadAndSubmitVideo,
} from "@/lib/services/splitstep/submit-match-video";
import { PROVIDER_ID } from "@/lib/services/splitstep/config";
import type { ProviderId } from "@/lib/services/upload";
import { MatchQueueStep } from "@/components/dashboard/schedule/upload/match-queue-step";
import { FilesStep } from "@/components/dashboard/schedule/upload/files-step";
import { DetailsStep } from "@/components/dashboard/schedule/upload/details-step";
import { ConfirmStep } from "@/components/dashboard/schedule/upload/confirm-step";
import {
  billableSeconds,
  emptyAnswers,
  formatSpan,
  STEP_ORDER,
  type AttachedFile,
  type LineAnswers,
  type SelectedEntry,
  type UploadStep,
} from "@/components/dashboard/schedule/upload/types";
import type { UploadQueueGroup } from "@/lib/schedule/types";

/**
 * SwingVision's id in the strategy registry — hyphenated, and typed so a
 * mismatched literal is a build error rather than an "Unsupported provider"
 * the coach only meets after picking a file.
 */
const SWINGVISION_PROVIDER_ID: ProviderId = "swing-vision";

/**
 * 22a–22f — the team upload wizard.
 *
 * Four steps: matches → videos → details → confirm. There is no source step,
 * because in a team workspace video IS the source: the lineup already minted
 * the line and the result already named the players, so the wizard's first
 * question changes from "where do the numbers come from?" to "which match is
 * this?".
 *
 * With `pinnedEntryId` set — every "Add video" link on a row — step 1 is
 * already answered and the flow opens on the video step with two segments
 * filled. The pinned chip stays editable rather than locked: arriving from the
 * wrong row should cost a click, not a restart.
 */
export function TeamUploadFlow({
  groups,
  pinnedEntryId,
  programName,
  poolRemainingSeconds,
  viewerInitials,
}: {
  groups: UploadQueueGroup[];
  pinnedEntryId: string | null;
  programName: string;
  poolRemainingSeconds: number;
  viewerInitials: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const pinned = pinnedEntryId
    ? groups.some((group) =>
        group.entries.some((entry) => entry.id === pinnedEntryId)
      )
    : false;

  const [step, setStep] = useState<UploadStep>(pinned ? "files" : "matches");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(pinned && pinnedEntryId ? [pinnedEntryId] : [])
  );
  const [files, setFiles] = useState<Record<string, AttachedFile>>({});
  const [answers, setAnswers] = useState<Record<string, LineAnswers>>({});
  const [fixedCamera, setFixedCamera] = useState<boolean | null>(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected: SelectedEntry[] = useMemo(
    () =>
      groups.flatMap((group) =>
        group.entries
          .filter((entry) => selectedIds.has(entry.id))
          .map((entry) => ({ entry, event: group.event }))
      ),
    [groups, selectedIds]
  );

  const lineTotals = useMemo(() => {
    const eventId = selected[0]?.event.id;
    const group = groups.find((candidate) => candidate.event.id === eventId);
    return { total: group?.total ?? selected.length, withVideo: group?.withVideo ?? 0 };
  }, [groups, selected]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const attachedCount = Object.keys(files).length;

  function toggle(entryId: string) {
    setSelectedIds((was) => {
      const next = new Set(was);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function attach(entryId: string, attached: AttachedFile) {
    setFiles((was) => ({ ...was, [entryId]: attached }));
    setAnswers((was) =>
      was[entryId]
        ? was
        : {
            ...was,
            [entryId]: emptyAnswers(
              selected
                .find((item) => item.entry.id === entryId)
                ?.entry.opponentLabels.join(" / ") ?? ""
            ),
          }
    );
  }

  function detach(entryId: string) {
    setFiles((was) => {
      const next = { ...was };
      delete next[entryId];
      return next;
    });
  }

  const canContinue =
    step === "matches"
      ? selectedIds.size > 0
      : step === "files"
        ? attachedCount === selected.length && attachedCount > 0
        : step === "details"
          ? selected.every(({ entry }) =>
              files[entry.id]?.kind === "video"
                ? answers[entry.id]?.startsTop !== null &&
                  answers[entry.id]?.startsTop !== undefined
                : true
            )
          : true;

  async function create() {
    setCreating(true);
    setError(null);
    const failures: string[] = [];

    for (const { entry } of selected) {
      const attached = files[entry.id];
      if (!attached) continue;
      const line = answers[entry.id];
      const label = entry.slot ?? entry.playerLabels.join(" / ");

      try {
        // A line with no match yet gets one now — same rule as the event page.
        // The score either already exists or was collected in step 3.
        let matchId = entry.matches[0]?.id ?? null;
        if (!matchId) {
          const played = [0, 1, 2].filter(
            (index) =>
              line?.ourGames[index] !== "" || line?.theirGames[index] !== ""
          );
          const result = await recordResult({
            entryId: entry.id,
            round: entry.slot ? null : (entry.matches[0]?.round ?? null),
            opponentLabels:
              entry.opponentLabels.length > 0
                ? entry.opponentLabels
                : line?.opponent
                    .split("/")
                    .map((part) => part.trim())
                    .filter(Boolean) ?? [],
            ourGames: played.map((index) => Number(line?.ourGames[index] || 0)),
            theirGames: played.map((index) => Number(line?.theirGames[index] || 0)),
            ourTiebreaks: played.map((index) =>
              line?.ourTiebreaks[index] ? Number(line.ourTiebreaks[index]) : null
            ),
            theirTiebreaks: played.map((index) =>
              line?.theirTiebreaks[index] ? Number(line.theirTiebreaks[index]) : null
            ),
          });
          if ("error" in result) throw new Error(result.error);
          matchId = result.matchId;
        }

        if (attached.kind === "import") {
          // The untouched file-import path. Numbers only — a different job.
          //
          // The id is `swing-vision`, hyphenated. It is the ProviderId union's
          // spelling, not the product's, and /api/upload rejects anything else
          // with "Unsupported provider" — a runtime failure no build catches.
          const body = new FormData();
          body.append("file", attached.file);
          body.append("matchId", matchId);
          body.append("providerId", SWINGVISION_PROVIDER_ID);
          const response = await fetch("/api/upload", { method: "POST", body });
          const payload = await response.json();
          if (!response.ok || !payload.success) {
            throw new Error(payload.error || "Import failed");
          }
          continue;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");

        // The camera answers are NOT written onto the match row. They travel in
        // the submit body and /api/splitstep/jobs persists them onto
        // processing_jobs, which is the only thing that reads them — the
        // matches columns are write-only leftovers from the personal wizard.
        //
        // Writing them here would also be a lie half the time: the matches
        // UPDATE policy is `auth.uid() = created_by`, so a coach uploading
        // video for a line a colleague scored would update zero rows with no
        // error at all.
        const job = await createProcessingJob({
          supabase,
          matchId,
          userId: user.id,
          provider: PROVIDER_ID,
          startSeconds: attached.startSeconds,
          endSeconds: attached.endSeconds,
          billableSeconds: Math.round(billableSeconds(attached)),
          hasFile: true,
        });

        // Background per line. One video failing must not abandon the rest.
        void uploadAndSubmitVideo({
          supabase,
          jobId: job.id,
          matchId,
          file: attached.file,
          answers: {
            initialTopPlayerIsPlayer1: line?.startsTop ?? undefined,
            adScoring:
              selected.find((item) => item.entry.id === entry.id)?.event.format
                .adScoring ?? undefined,
            fixedCamera: fixedCamera ?? undefined,
          },
        });
      } catch (err) {
        failures.push(
          `${label}: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    if (failures.length > 0) {
      setError(failures.join(" · "));
      setCreating(false);
      return;
    }

    const eventId = selected[0]?.event.id;
    router.push(
      eventId ? `/dashboard/team/schedule/${eventId}` : "/dashboard/team/schedule"
    );
    router.refresh();
  }

  const totalSeconds = Object.values(files).reduce(
    (sum, attached) => sum + billableSeconds(attached),
    0
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--border-hairline)] px-6">
        <Link
          href="/dashboard/team/schedule"
          className="text-[12px] text-[var(--ink-500)]"
        >
          Schedule
        </Link>
        <ChevronRight strokeWidth={1.5} className="size-3 text-[var(--ink-300)]" />
        <span className="text-[12px] text-[var(--ink-900)]">Upload video</span>
        <div className="flex-1" />
        <span className="inline-flex size-[26px] items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]">
          {viewerInitials}
        </span>
      </div>

      <div className="flex h-0.5 shrink-0 gap-[3px]">
        {STEP_ORDER.map((entry, index) => (
          <div
            key={entry}
            className="flex-1"
            style={{
              background:
                index <= stepIndex ? "var(--blue)" : "var(--ink-100)",
            }}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-14 pb-8 pt-[26px]">
        <div className="mx-auto w-[780px] max-w-full">
          {pinned && step === "files" ? (
            <div className="mb-4 flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5">
              <CornerDownRight
                strokeWidth={1.5}
                className="size-[13px] text-[var(--ink-600)]"
              />
              <span className="text-[12px] text-[var(--ink-900)]">
                {selected[0]
                  ? `${selected[0].entry.playerLabels.join(" / ")} · ${selected[0].event.name}`
                  : "One match"}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setStep("matches")}
                className="cursor-pointer text-[11px] font-medium text-[var(--blue)]"
              >
                Change
              </button>
            </div>
          ) : null}

          {step === "matches" ? (
            <MatchQueueStep
              groups={groups}
              selected={selectedIds}
              onToggle={toggle}
            />
          ) : null}

          {step === "files" ? (
            <FilesStep
              selected={selected}
              files={files}
              onAttach={attach}
              onDetach={detach}
              poolRemainingSeconds={poolRemainingSeconds}
            />
          ) : null}

          {step === "details" ? (
            <DetailsStep
              selected={selected}
              files={files}
              answers={answers}
              fixedCamera={fixedCamera}
              onFixedCamera={setFixedCamera}
              onAnswer={(entryId, patch) =>
                setAnswers((was) => ({
                  ...was,
                  [entryId]: { ...(was[entryId] ?? emptyAnswers("")), ...patch },
                }))
              }
            />
          ) : null}

          {step === "confirm" ? (
            <ConfirmStep
              selected={selected}
              files={files}
              answers={answers}
              fixedCamera={fixedCamera}
              lineTotals={lineTotals}
            />
          ) : null}
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center border-t border-[var(--border-hairline)] px-14">
        <div className="mx-auto flex w-[780px] max-w-full items-center gap-3.5">
          {stepIndex > 0 ? (
            <button
              type="button"
              className={advButton("ghost", "md")}
              onClick={() => setStep(STEP_ORDER[stepIndex - 1])}
            >
              Back
            </button>
          ) : null}

          {step === "confirm" ? (
            <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
              Creates in{" "}
              <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                {programName}
              </span>{" "}
              · counts against the team pool
            </span>
          ) : null}

          <div className="flex-1" />

          {error ? (
            <span className="truncate text-[11px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          ) : step === "matches" ? (
            <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
              <span className="tabular font-medium" style={{ color: "var(--ink-900)" }}>
                {selectedIds.size}
              </span>{" "}
              {selectedIds.size === 1 ? "match" : "matches"} ticked · one video each
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
              <span className="mono tabular">{formatSpan(totalSeconds)}</span> ·{" "}
              <span className="mono tabular">
                {formatSpan(Math.max(0, poolRemainingSeconds - totalSeconds))}
              </span>{" "}
              left after
            </span>
          )}

          {step === "confirm" ? (
            <button
              type="button"
              disabled={creating || attachedCount === 0}
              className={advButton("primary", "md")}
              onClick={create}
            >
              {creating
                ? "Creating…"
                : `Create ${attachedCount} ${attachedCount === 1 ? "match" : "matches"}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canContinue}
              className={advButton("primary", "md")}
              onClick={() => setStep(STEP_ORDER[stepIndex + 1])}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
