"use client";

// Page shell for the Upload flow
// Layout:
// - Left: steps sidebar
// - Right: select match, optional create match, upload area, confirm match
// Data flow:
// - SelectMatch emits a row; we pass its id to UploadMatch and ConfirmMatch
// - CreateMatch inserts a minimal `matches` row then sets selection

// Client-side page shell for the Upload screen.
// Composes the SelectMatch component and shows a preview card
// of the currently selected match.

import { useState } from "react";
import { SelectMatch, SelectMatchValue } from "@/components/dashboard/upload/select-match";
import { UploadSteps } from "@/components/dashboard/upload/upload-steps";
import { UploadMatch } from "@/components/dashboard/upload/upload-match";
import { ConfirmMatch } from "@/components/dashboard/upload/confirm-match";
import { CreateMatch } from "@/components/dashboard/upload/create-match";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function UploadClient() {
  const [selected, setSelected] = useState<SelectMatchValue>(null);

  return (
    <div className="flex-1 w-full p-6">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
        <div>
          <UploadSteps />
        </div>
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Select Match</h2>
            <p className="text-sm text-muted-foreground">Select a recent match or create a new match</p>
          </div>

          {/* Search and pick a match from Supabase */}
          <SelectMatch value={selected} onChange={setSelected} />

          <CreateMatch onCreated={(id) => setSelected({ id, player1_id: null, player1_name: null, player2_id: null, player2_name: null, date: null, round: null, score: null })} />

          {selected && (
        <Card>
          <CardContent>
            {/* Replicate RecentMatches rows */}
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Final Score{selected.round ? ` | ${selected.round}` : ""}</span>
              <span>{formatTime(selected.date)}</span>
            </div>

            {renderMatchRows(selected)}
          </CardContent>
        </Card>
          )}

          <UploadMatch matchId={selected?.id ?? null} />

          <ConfirmMatch matchId={selected?.id ?? null} />
        </div>
      </div>
    </div>
  );
}

// Header text for the selected match (round • time-of-day)
function formatHeader(m: NonNullable<SelectMatchValue>) {
  const left = [m.round ?? undefined]
    .filter(Boolean)
    .join(" | ");
  const time = m.date
    ? new Date(m.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;
  return [left, time].filter(Boolean).join(" • ");
}

// Normalizes any score shape into a short, readable string
function formatScore(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") {
    try {
      const vals = Object.values(value as Record<string, unknown>).map(String);
      return vals.join(" ");
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatTime(date: string | null | undefined) {
  return date
    ? new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : undefined;
}

// Mirror of list rendering: two rows with per-set scores
function renderMatchRows(m: NonNullable<SelectMatchValue>) {
  const { playerScores, opponentScores } = computeScoresFromObject(m.score, true);
  const p1Name = m.player1_name ?? `Player ${String(m.player1_id ?? "").trim()}`;
  const p2Name = m.player2_name ?? `Player ${String(m.player2_id ?? "").trim()}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="bg-gray-300 w-8 h-8 rounded" />
          <p className="truncate">{p1Name}</p>
        </div>
        <div className="flex items-center gap-4">
          {playerScores.map((s, i) => (
            <p key={i}>{s ?? 0}</p>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="bg-gray-300 w-8 h-8 rounded" />
          <p className="truncate">{p2Name}</p>
        </div>
        <div className="flex items-center gap-4">
          {opponentScores.map((s, i) => (
            <p key={i}>{s ?? 0}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

type NormalizedSet = { winner: number; loser: number };

function computeScoresFromObject(
  score: unknown,
  perspectivePlayerIsPlayer1: boolean,
) {
  const sets = normalizeScoreSets(score);
  const playerScores: number[] = [];
  const opponentScores: number[] = [];
  for (const set of sets) {
    const winner = toNumber(set.winner);
    const loser = toNumber(set.loser);
    if (perspectivePlayerIsPlayer1) {
      playerScores.push(winner);
      opponentScores.push(loser);
    } else {
      playerScores.push(loser);
      opponentScores.push(winner);
    }
  }
  return { playerScores, opponentScores };
}

function normalizeScoreSets(value: unknown): NormalizedSet[] {
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, any>;
  const entries = Object.entries(obj)
    .filter(([k]) => /^\d+$/.test(k))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  return entries.map(([, set]) => ({
    winner: toNumber(set?.winner),
    loser: toNumber(set?.loser),
  }));
}

function toNumber(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num : 0;
}


