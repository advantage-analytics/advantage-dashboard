"use client";

/**
 * ConfirmContent — Step 5.
 * Aligned to home card chrome: white surface, `border-[#F3F3F3]`, `shadow-card`,
 * Accent rail keeps the editorial signature.
 */

import { Switch } from "@/components/ui/switch";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";
import { AlertCircle, Calendar, Clock, MapPin, Trophy } from "lucide-react";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
  error: string | null;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "—"
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return "Date pending";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function determineWinner(
  playerScores: (number | null)[],
  opponentScores: (number | null)[]
): "player" | "opponent" | null {
  let p = 0,
    o = 0;
  for (let i = 0; i < playerScores.length; i++) {
    const ps = playerScores[i] ?? 0;
    const os = opponentScores[i] ?? 0;
    if (ps > os) p++;
    else if (os > ps) o++;
  }
  if (p > o) return "player";
  if (o > p) return "opponent";
  return null;
}

function getMatchStatus(result: string | undefined): string {
  if (!result) return "Final";
  if (result === "Unfinished") return "Unfinished";
  if (result.includes("Withdrew")) return "Withdrew";
  if (result.includes("Defaulted")) return "Defaulted";
  return "Final";
}

export function ConfirmContent({
  formData,
  isPrivateMatch,
  error,
}: ConfirmContentProps) {
  const playerScores = getAdjustedScores(
    formData.playerScores,
    formData.bestOf,
    formData.numberOfSets
  );
  const opponentScores = getAdjustedScores(
    formData.opponentScores,
    formData.bestOf,
    formData.numberOfSets
  );

  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";
  const winner = determineWinner(playerScores, opponentScores);
  const status = getMatchStatus(formData.result);
  const eventTitle =
    formData.eventName || `${playerName} vs ${opponentName}`;

  const meta: { icon: typeof Calendar; label: string }[] = [];
  if (formData.date) meta.push({ icon: Calendar, label: formatDate(formData.date) });
  if (formData.duration)
    meta.push({ icon: Clock, label: formatDuration(formData.duration) });
  if (formData.courtType) meta.push({ icon: MapPin, label: formData.courtType });
  if (formData.matchType) meta.push({ icon: Trophy, label: formData.matchType });

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Hero scoreboard — home card chrome */}
      <div className="relative overflow-hidden rounded-[14px] bg-white border border-[#F3F3F3] shadow-card p-6">
        <span
          aria-hidden
          className="absolute top-6 bottom-6 left-0 w-[3px] bg-[#3B82F6] rounded-r-full"
        />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              {status} · {formData.round || "Match"}
            </span>
            {formData.duration ? (
              <span className="rounded-full bg-[#F5F5F5] border border-[#F3F3F3] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[#0D0D0D]">
                {formatDuration(formData.duration)}
              </span>
            ) : null}
          </div>

          <h3 className="mt-2 text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px] leading-[24px]">
            {eventTitle}
          </h3>

          <div className="mt-4 space-y-2.5">
            <PlayerRow
              name={playerName}
              isWinner={winner === "player"}
              scores={playerScores}
              opponentScores={opponentScores}
              tag="You"
            />
            <div className="h-px w-full bg-[#F3F3F3]" />
            <PlayerRow
              name={opponentName}
              isWinner={winner === "opponent"}
              scores={opponentScores}
              opponentScores={playerScores}
            />
          </div>
        </div>
      </div>

      {meta.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {meta.map(({ icon: Icon, label }, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F5] border border-[#F3F3F3] px-2.5 py-1 text-[11px] font-normal text-[#525252]"
            >
              <Icon className="size-3 text-[#888888]" strokeWidth={1.5} />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Format */}
      <section>
        <h4 className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Format
        </h4>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <FormatChip
            label="Sets"
            value={formData.bestOf ? `Best of ${formData.bestOf}` : "—"}
          />
          <FormatChip
            label="Scoring"
            value={formData.adScoring ? "Ad" : "No-Ad"}
          />
          <FormatChip
            label="Lets"
            value={formData.playOnLets ? "Play on" : "Standard"}
          />
        </div>
      </section>

      {/* Privacy */}
      <section className="flex items-center justify-between rounded-[10px] bg-white border border-[#F3F3F3] px-4 py-3.5">
        <div>
          <p className="text-[13px] font-normal text-[#0D0D0D]">
            Make this match public
          </p>
          <p className="mt-0.5 text-[12px] font-light text-[#888888] leading-[1.5]">
            All matches are private during Beta — public sharing comes later.
          </p>
        </div>
        <Switch
          checked={!isPrivateMatch}
          disabled
          className="opacity-50 cursor-not-allowed"
        />
      </section>

      {error && (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-[#FECACA] bg-[var(--color-error-bg)] px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-error)]" />
          <p className="text-[12px] text-[var(--color-error)]">{error}</p>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  name,
  scores,
  opponentScores,
  isWinner,
  tag,
}: {
  name: string;
  scores: (number | null)[];
  opponentScores: (number | null)[];
  isWinner: boolean;
  tag?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[10px] font-semibold tracking-[0.5px] transition ${
            isWinner
              ? "bg-[#0D0D0D] text-white"
              : "bg-[#FAFAFA] text-[#AAAAAA] border border-[#F3F3F3]"
          }`}
        >
          {getInitials(name)}
        </div>
        <div className="min-w-0 flex items-baseline gap-1.5">
          <p
            className={`truncate text-[14px] font-normal tracking-[-0.4px] ${
              isWinner ? "text-[#0D0D0D]" : "text-[#888888]"
            }`}
          >
            {name}
          </p>
          {tag && (
            <span className="flex-none text-[9px] font-normal uppercase tracking-[2.5px] text-[#3B82F6]">
              {tag}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 tabular-nums">
        {scores.map((score, idx) => {
          const ps = score ?? 0;
          const os = opponentScores[idx] ?? 0;
          const setWon = ps > os;
          return (
            <span
              key={idx}
              className={`text-[24px] font-light tracking-[-0.5px] leading-none ${
                setWon ? "text-[#0D0D0D]" : "text-[#CCCCCC]"
              }`}
            >
              {ps}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FormatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-[#FAFAFA] border border-[#F3F3F3] px-3 py-2.5">
      <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px]">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] font-light text-[#0D0D0D] tracking-[-0.2px]">
        {value}
      </p>
    </div>
  );
}
