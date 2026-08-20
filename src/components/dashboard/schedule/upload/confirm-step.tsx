"use client";

import { Calendar, FileVideo, Swords, Trophy, Video } from "lucide-react";
import { formatEventDay, formatScore, siteLabel } from "@/lib/schedule/format";
import {
  billableSeconds,
  formatBytes,
  formatClock,
  formatSpan,
  type AttachedFile,
  type LineAnswers,
  type SelectedEntry,
} from "@/components/dashboard/schedule/upload/types";

/**
 * 22e — the readback, per video, under one event header.
 *
 * The destination is the claim being confirmed, which is why the receipt above
 * the table counts lines rather than files: "Fills 3 of the dual's 9 lines"
 * is the proof that no duplicate match is being minted.
 *
 * No ETA anywhere. Jobs queue and the state is shown; a predicted finish time
 * is a promise nothing in the pipeline can keep.
 */
export function ConfirmStep({
  selected,
  files,
  answers,
  fixedCamera,
  lineTotals,
}: {
  selected: SelectedEntry[];
  files: Record<string, AttachedFile>;
  answers: Record<string, LineAnswers>;
  fixedCamera: boolean | null;
  /** Lines this event already has, and how many carry video. */
  lineTotals: { total: number; withVideo: number };
}) {
  const event = selected[0]?.event;
  if (!event) return null;

  const totalSeconds = Object.values(files).reduce(
    (sum, attached) => sum + billableSeconds(attached),
    0
  );
  const totalBytes = Object.values(files).reduce(
    (sum, attached) => sum + attached.file.size,
    0
  );

  const sameEvent = selected.every((item) => item.event.id === event.id);
  const heading = sameEvent
    ? `${event.kind === "dual" ? `at ${event.name}` : event.name} — ${selected.length} match ${selected.length === 1 ? "video" : "videos"}`
    : `${selected.length} match videos across ${new Set(selected.map((item) => item.event.id)).size} events`;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2.5">
        <h3
          className="m-0 text-[22px] font-normal leading-[26px] tracking-[-0.5px]"
          style={{ color: "#0D0D0D" }}
        >
          {heading}
        </h3>
        {sameEvent ? (
          <div className="flex items-center gap-4">
            <Fact icon={Calendar} label={formatEventDay(event.startsOn)} />
            <Fact
              icon={event.kind === "dual" ? Swords : Trophy}
              label={`${event.kind === "dual" ? "Dual" : "Tournament"} · ${siteLabel(event.site)}`}
            />
            {event.surface ? <Fact icon={Video} label={event.surface} /> : null}
            {fixedCamera ? (
              <Fact icon={Video} label="Fixed camera · back of court" />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 pb-3">
          <span
            className="text-[10px] font-medium uppercase tracking-[2.5px]"
            style={{ color: "#AAAAAA" }}
          >
            Fills {selected.length} of {sameEvent ? `the ${event.kind}'s ` : ""}
            {lineTotals.total} lines ·{" "}
            {Math.min(lineTotals.total, lineTotals.withVideo + selected.length)} of{" "}
            {lineTotals.total} after this
          </span>
          <span
            className="tabular text-[10px] font-medium uppercase tracking-[2.5px]"
            style={{ color: "#AAAAAA" }}
          >
            {formatSpan(totalSeconds)}
          </span>
        </div>

        {selected.map(({ entry }) => {
          const attached = files[entry.id];
          if (!attached) return null;
          const match = entry.matches[0] ?? null;
          const line = answers[entry.id];
          const ourName = entry.playerLabels[0] ?? "Our player";
          const scored =
            formatScore(match?.score?.player1, match?.score?.player2) ||
            formatScore(
              line?.ourGames.filter(Boolean).map(Number),
              line?.theirGames.filter(Boolean).map(Number)
            );

          return (
            <div
              key={entry.id}
              className="grid grid-cols-[40px_1fr_130px_170px_90px] items-center gap-3.5 border-t border-[#F3F3F3] py-[13px]"
            >
              <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
                {entry.slot ?? match?.round ?? "—"}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14px]" style={{ color: "#0D0D0D" }}>
                  {entry.playerLabels.join(" / ")}{" "}
                  <span style={{ color: "#525252" }}>vs</span>{" "}
                  {(match?.opponentLabels ?? entry.opponentLabels).join(" / ") ||
                    line?.opponent ||
                    "—"}
                </div>
                <div
                  className="text-micro mt-[3px]"
                  style={{ color: "var(--ink-500)" }}
                >
                  {attached.kind === "import"
                    ? "SwingVision export · numbers only"
                    : line?.startsTop === null || line?.startsTop === undefined
                      ? "starting end not answered"
                      : `${ourName} ${line.startsTop ? "top" : "bottom"} of frame`}
                  {match?.score?.player1?.length ? "" : " · score added here"}
                </div>
              </div>
              <span
                className="tabular text-right text-[14px]"
                style={{ color: "#0D0D0D" }}
              >
                {scored}
              </span>
              <span
                className="mono tabular text-right text-[11px]"
                style={{ color: "var(--ink-600)" }}
              >
                {attached.kind === "video"
                  ? `${formatClock(attached.startSeconds)} – ${formatClock(attached.endSeconds)}`
                  : "—"}
              </span>
              <span
                className="tabular text-right text-[11px]"
                style={{ color: "var(--ink-600)" }}
              >
                {formatBytes(attached.file.size)}
              </span>
            </div>
          );
        })}
        <div className="h-px bg-[#F3F3F3]" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow">After create</span>
        <span
          className="text-[12px] leading-[1.55]"
          style={{ color: "var(--ink-700)" }}
        >
          {countVideos(files)} {countVideos(files) === 1 ? "job queues" : "jobs queue"}{" "}
          for Advantage Intelligence — progress lives on each line. Every player
          named above sees their own match the moment it&rsquo;s created.
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <FileVideo
          strokeWidth={1.75}
          className="size-3 shrink-0"
          style={{ color: "#CCCCCC" }}
        />
        <p
          className="m-0 truncate text-[11px] leading-4"
          style={{ color: "#AAAAAA" }}
        >
          <span className="mr-1.5 uppercase tracking-[1.5px]">Source</span>
          {Object.values(files)
            .map((attached) => attached.file.name)
            .join(" · ")}
          <span className="mx-1.5" style={{ color: "#CCCCCC" }}>
            ·
          </span>
          <span className="tabular">{formatBytes(totalBytes)} total</span>
        </p>
      </div>
    </div>
  );
}

function countVideos(files: Record<string, AttachedFile>): number {
  return Object.values(files).filter((attached) => attached.kind === "video").length;
}

function Fact({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Icon strokeWidth={1.5} className="size-3.5" style={{ color: "#888888" }} />
      <span className="text-[10px] leading-4" style={{ color: "#888888" }}>
        {label}
      </span>
    </div>
  );
}
