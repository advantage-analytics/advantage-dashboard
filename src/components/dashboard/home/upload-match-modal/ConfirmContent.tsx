"use client";

/**
 * ConfirmContent — Step 4 of 4 (peak-end summary)
 */

import { memo, useMemo } from "react";
import { AlertCircle, FileSpreadsheet } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { formatPlayerStyle } from "@/lib/data/match-utils";
import { FormData, UploadedFile, DetailField } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";
import { eyebrowLabelCls } from "./styles";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  error: string | null;
  /** Click handler for "Not set" rows — sends user back to Match focused on that field. */
  onEditDetail?: (field: DetailField) => void;
}

function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getSetWinner(
  playerScores: (number | null)[],
  opponentScores: (number | null)[]
): "player" | "opponent" | null {
  let p = 0;
  let o = 0;
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
  if (!result) return "Final score";
  if (result === "Unfinished") return "Unfinished";
  if (result.includes("Withdrew")) return "Withdrew";
  if (result.includes("Defaulted")) return "Defaulted";
  return "Final score";
}

function PlayerRow({
  name,
  style,
  isWinner,
  mineScores,
  theirScores,
  theirTiebreaks,
}: {
  name: string;
  style: string[];
  isWinner: boolean;
  mineScores: (number | null)[];
  theirScores: (number | null)[];
  theirTiebreaks: (number | null)[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <p
            className={`text-[14px] leading-[20px] truncate ${
              isWinner ? "font-medium text-[#0D0D0D]" : "font-normal text-[#525252]"
            }`}
          >
            {name}
          </p>
          {isWinner && (
            <span className="text-[10px] leading-[16px] font-medium text-[#5DB955] uppercase tracking-[2.5px]">
              Won
            </span>
          )}
        </div>
        {style.length > 0 && (
          <div className="flex items-start gap-2 text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px] overflow-hidden whitespace-nowrap">
            {style.map((meta, i) => (
              <span key={i} className="shrink-0">
                {i > 0 && <span className="mr-2">·</span>}
                {meta}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 text-[18px] leading-[24px] tabular-nums tracking-[-0.3px] shrink-0">
        {mineScores.map((score, idx) => {
          const ps = score ?? 0;
          const os = theirScores[idx] ?? 0;
          const won = ps > os;
          const isTbSet = ps === 7 && os === 6;
          const tb = theirTiebreaks[idx];
          const showTb = isTbSet && won && tb != null;
          return (
            <span
              key={idx}
              className={`w-10 inline-flex items-baseline justify-center ${
                won ? "font-medium text-[#0D0D0D]" : "font-normal text-[#525252]"
              }`}
            >
              <span className="relative">
                {ps}
                {showTb && (
                  <span
                    aria-hidden="true"
                    className="absolute left-full top-0 ml-0.5 text-[10px] font-medium leading-none text-[#AAAAAA] -translate-y-1.5"
                  >
                    {tb}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const labelCls = eyebrowLabelCls;

function ConfirmContentImpl({
  formData,
  uploadedFile,
  error,
  onEditDetail,
}: ConfirmContentProps) {
  const { playerScores, opponentScores, playerTiebreaks, opponentTiebreaks } = useMemo(() => ({
    playerScores: getAdjustedScores(formData.playerScores, formData.bestOf, formData.numberOfSets),
    opponentScores: getAdjustedScores(formData.opponentScores, formData.bestOf, formData.numberOfSets),
    playerTiebreaks: getAdjustedScores(formData.playerTiebreaks, formData.bestOf, formData.numberOfSets),
    opponentTiebreaks: getAdjustedScores(formData.opponentTiebreaks, formData.bestOf, formData.numberOfSets),
  }), [
    formData.playerScores,
    formData.opponentScores,
    formData.playerTiebreaks,
    formData.opponentTiebreaks,
    formData.bestOf,
    formData.numberOfSets,
  ]);

  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";
  const winner = getSetWinner(playerScores, opponentScores);
  const playerStyle = formatPlayerStyle(formData.playerHand, formData.playerBackhand);
  const opponentStyle = formatPlayerStyle(formData.opponentHand, formData.opponentBackhand);
  const eventTitle =
    formData.eventName?.trim() || `${playerName} vs ${opponentName}`;
  const round = formData.round || undefined;
  const matchType = formData.matchType || undefined;
  const courtType = formData.courtType || undefined;

  return (
    <div className="flex flex-col">
      {/* Error — pinned to the top so it's visible after a failed save even if the modal scrolled.
          Leads with the reason, ends with the recovery path. */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] p-3 mb-6"
        >
          <AlertCircle
            className="size-4 text-[#E51837] mt-px flex-shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[12px] leading-[18px] font-medium text-[#E51837]">
              We couldn&apos;t save this match
            </p>
            <p className="text-[12px] leading-[18px] text-[#E51837]/80 break-words">
              {error}
            </p>
            <p className="text-[12px] leading-[18px] text-[#E51837]/70">
              Review the details below, then try Save again.
            </p>
          </div>
        </div>
      )}

      {/* Hero — event title + metadata. Skip the meta row entirely when there's
          nothing to render so it doesn't claim its gap slot below the title. */}
      {(() => {
        const formattedDate = formatDate(formData.date);
        const hasMeta = !!(formattedDate || matchType || courtType);
        return (
          <div className={`flex flex-col ${hasMeta ? "gap-2.5" : ""}`}>
            <h3 className="text-[22px] font-normal tracking-[-0.5px] leading-[26px] text-[#0D0D0D]">
              {eventTitle}
            </h3>
            {hasMeta && (
              <MatchMetadataRow
                date={formattedDate}
                matchType={matchType}
                courtType={courtType}
                showVerification={false}
              />
            )}
          </div>
        );
      })()}

      {/* Scoreboard — the peak moment, given a hair more breathing room above */}
      <div className="flex flex-col mt-10">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <p className={eyebrowLabelCls}>
            {getMatchStatus(formData.result)}
            {round ? ` · ${round}` : ""}
          </p>
          {(formData.duration ?? 0) > 0 && (
            <span className={`${eyebrowLabelCls} tabular-nums`}>
              {formatDuration(formData.duration)}
            </span>
          )}
        </div>

        <div className="h-px bg-[#F3F3F3] mt-3" />

        {/* Set headers — column labels aligned with the score cells below */}
        <div className="flex justify-end mt-4">
          <div className="flex gap-1.5">
            {playerScores.map((_, i) => (
              <div
                key={i}
                className="w-10 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] tabular-nums"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Player rows */}
        <div className="flex flex-col gap-4 mt-3">
          {/* Player 1 */}
          <PlayerRow
            name={playerName}
            style={playerStyle}
            isWinner={winner === "player"}
            mineScores={playerScores}
            theirScores={opponentScores}
            theirTiebreaks={opponentTiebreaks}
          />

          {/* Player 2 */}
          <PlayerRow
            name={opponentName}
            style={opponentStyle}
            isWinner={winner === "opponent"}
            mineScores={opponentScores}
            theirScores={playerScores}
            theirTiebreaks={playerTiebreaks}
          />
        </div>

        <div className="h-px bg-[#F3F3F3] mt-4" />
      </div>

      {/* Quiet 3-column definition grids. Unset Round/Match type/Court render
          as "+ Add ..." links that send the user back to Match with the
          relevant select focused — honoring intent (the user can ignore them)
          while keeping the recovery path one click away. */}
      {(() => {
        type Item = { label: string; value: string; defaulted: boolean };
        type EditableItem = Item & { field: DetailField; addLabel: string };
        const detailItems: EditableItem[] = [
          {
            label: "Round",
            field: "round",
            addLabel: "Add round",
            value: round ?? "Not set",
            defaulted: !round,
          },
          {
            label: "Match type",
            field: "matchType",
            addLabel: "Add type",
            value: matchType ?? "Not set",
            defaulted: !matchType,
          },
          {
            label: "Court",
            field: "courtType",
            addLabel: "Add court",
            value: courtType ?? "Not set",
            defaulted: !courtType,
          },
        ];
        const formatItems: Item[] = [
          {
            label: "Format",
            value: `Best of ${formData.bestOf || 3} sets`,
            defaulted: !formData.bestOf,
          },
          {
            label: "Scoring",
            value: formData.adScoring === false ? "No-ad" : "Ad",
            defaulted: formData.adScoring === undefined,
          },
          {
            label: "Lets",
            value: formData.playOnLets ? "Play on" : "Stop on",
            defaulted: formData.playOnLets === undefined,
          },
        ];
        const valueCls = (defaulted: boolean) =>
          `text-[13px] leading-[18px] font-normal tracking-[-0.1px] ${
            defaulted ? "text-[#AAAAAA]" : "text-[#0D0D0D]"
          }`;
        return (
          <>
            <dl className="grid grid-cols-3 gap-x-6 mt-8">
              {detailItems.map((item) => (
                <div key={item.label} className="flex flex-col gap-2">
                  <dt className={eyebrowLabelCls}>{item.label}</dt>
                  <dd>
                    {item.defaulted && onEditDetail ? (
                      // Quiet at rest so three "+ Add" links don't read as a
                      // wagging finger when a new user lands here with everything
                      // unset. Color climbs to accent only on hover/focus.
                      <button
                        type="button"
                        onClick={() => onEditDetail(item.field)}
                        className="group/add inline-flex items-baseline gap-1 text-[13px] leading-[18px] font-normal tracking-[-0.1px] text-[#525252] hover:text-[#2563EB] focus-visible:text-[#3B82F6] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
                      >
                        <span className="text-[#CCCCCC] group-hover/add:text-[#3B82F6] group-focus-visible/add:text-[#3B82F6] transition-colors duration-150">
                          +
                        </span>
                        {item.addLabel}
                      </button>
                    ) : (
                      <span className={valueCls(item.defaulted)}>{item.value}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="grid grid-cols-3 gap-x-6 mt-6">
              {formatItems.map((item) => (
                <div key={item.label} className="flex flex-col gap-2">
                  <dt className={eyebrowLabelCls}>{item.label}</dt>
                  <dd className={valueCls(item.defaulted)}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </>
        );
      })()}

      {/* Source file — footnote-class metadata. Quieter treatment + tighter spacing
          so it stops competing with the hero, scoreboard, and format grid above. */}
      {uploadedFile && (
        <div className="flex items-center gap-1.5 min-w-0 mt-6">
          <FileSpreadsheet
            className="size-3 text-[#CCCCCC] shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[11px] leading-[16px] text-[#AAAAAA] truncate">
            <span className="uppercase tracking-[1.5px] mr-1.5">Source</span>
            {uploadedFile.name}
            <span className="text-[#CCCCCC] mx-1.5">·</span>
            <span className="tabular-nums">{uploadedFile.size}</span>
          </p>
        </div>
      )}

    </div>
  );
}

export const ConfirmContent = memo(ConfirmContentImpl);
