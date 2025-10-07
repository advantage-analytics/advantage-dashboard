"use client";

// Component: ConfirmMatch
// Purpose:
// - Fetch the selected match row and present editable fields
// - Keep edits local; save all changes in a single update via “Confirm Changes”
// - Show and edit per-set scores with player1 assumed as winner
// Data model expectations:
// - matches table includes: player1_name, player2_name, round, tournament_name,
//   best_of (3|5), ad_scoring (bool), play_on_lets (bool), date (ISO), score (object)

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MatchData = {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
  tournament_name?: string | null;
  round?: string | null;
  best_of?: number | null;
  ad_scoring?: boolean | null;
  play_on_lets?: boolean | null;
  score?: any;
};

export function ConfirmMatch({ matchId }: { matchId?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [p1Scores, setP1Scores] = useState<number[]>([0, 0, 0]);
  const [p2Scores, setP2Scores] = useState<number[]>([0, 0, 0]);

  // Fetch match data when matchId changes
  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      return;
    }
    const fetchMatch = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("matches")
          .select("*")
          .eq("id", matchId)
          .single();
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Fetch error:", error);
          throw error;
        }
        // eslint-disable-next-line no-console
        console.log("Fetched match data:", data);
        const m = data as MatchData;
        setMatch(m);
        // Initialize score arrays from object assuming player1 winner
        const { playerScores, opponentScores } = scoresFromScoreObject(m.score);
        setP1Scores(fillToThree(playerScores));
        setP2Scores(fillToThree(opponentScores));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error fetching match:", e);
        setMatch(null);
      } finally {
        setLoading(false);
      }
    };
    void fetchMatch();
  }, [matchId, supabase]);

  const onScoreChange = (which: 1 | 2, idx: number, val: string) => {
    const n = Number(val);
    if (which === 1) {
      const next = [...p1Scores];
      next[idx] = Number.isFinite(n) ? n : 0;
      setP1Scores(next);
    } else {
      const next = [...p2Scores];
      next[idx] = Number.isFinite(n) ? n : 0;
      setP2Scores(next);
    }
  };

  // Persist all local edits in one UPDATE to reduce latency and avoid per-keystroke writes
  const confirmChanges = async () => {
    if (!matchId) return;
    setSaving(true);
    try {
      const score = scoreObjectFromArrays(p1Scores, p2Scores);
      // Build one update payload using local draft state
      const payload: Record<string, any> = {
        score,
      };
      if (match) {
        payload.tournament_name = match.tournament_name ?? null;
        payload.round = match.round ?? null;
        payload.best_of = match.best_of ?? null;
        payload.ad_scoring = match.ad_scoring ?? false;
        payload.play_on_lets = match.play_on_lets ?? false;
        payload.player1_name = match.player1_name ?? null;
        payload.player2_name = match.player2_name ?? null;
      }

      const { error } = await supabase
        .from("matches")
        .update(payload)
        .eq("id", matchId);
      if (error) throw error;
      // reflect back into local state
      setMatch((prev) => (prev ? { ...prev, ...payload } : prev));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!matchId) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold tracking-tight">Confirm Match</h3>
          <p className="text-sm text-muted-foreground">Confirm your match information</p>
        </div>
        <div className="text-sm text-muted-foreground">Select a match to continue</div>
      </div>
    );
  }

  if (loading || !match) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold tracking-tight">Confirm Match</h3>
          <p className="text-sm text-muted-foreground">Confirm your match information</p>
        </div>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-2xl font-semibold tracking-tight">Confirm Match</h3>
        <p className="text-sm text-muted-foreground">Confirm your match information</p>
      </div>

      {/* Tournament Information */}
      <div className="space-y-3">
        <h4 className="font-semibold">Tournament Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="tournament-name">Tournament Name</Label>
            <Input
              id="tournament-name"
              value={match.tournament_name ?? ""}
              onChange={(e) => setMatch((prev) => (prev ? { ...prev, tournament_name: e.target.value } : prev))}
              placeholder="Tournament Name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="round">Round</Label>
            <Input
              id="round"
              value={match.round ?? ""}
              onChange={(e) => setMatch((prev) => (prev ? { ...prev, round: e.target.value } : prev))}
              placeholder="Round"
            />
          </div>
        </div>
      </div>

      {/* Scoring Format */}
      <div className="space-y-3">
        <h4 className="font-semibold">Scoring Format</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="best-of">Best of...</Label>
            <Select
              value={(match.best_of ?? 3).toString()}
              onValueChange={(v) => setMatch((prev) => (prev ? { ...prev, best_of: parseInt(v) } : prev))}
            >
              <SelectTrigger className="w-full justify-between" id="best-of">
                <SelectValue>{match.best_of ?? 3} Sets</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="ad-scoring"
              checked={match.ad_scoring ?? false}
              onChange={(e) => setMatch((prev) => (prev ? { ...prev, ad_scoring: e.target.checked } : prev))}
              className="h-4 w-4"
            />
            <Label htmlFor="ad-scoring" className="cursor-pointer">Ad Scoring</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="play-on-lets"
              checked={match.play_on_lets ?? false}
              onChange={(e) => setMatch((prev) => (prev ? { ...prev, play_on_lets: e.target.checked } : prev))}
              className="h-4 w-4"
            />
            <Label htmlFor="play-on-lets" className="cursor-pointer">Play on Lets</Label>
          </div>
        </div>
      </div>

      {/* Match Information */}
      <div className="space-y-3">
        <h4 className="font-semibold">Match Information</h4>
        <div className="space-y-3">
          {/* Player row */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={match.player1_name ?? ""}
                onChange={(e) => setMatch((prev) => (prev ? { ...prev, player1_name: e.target.value } : prev))}
                placeholder="Player Name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Game Score</Label>
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    className="w-12 text-center"
                    value={p1Scores[i] ?? 0}
                    onChange={(e) => onScoreChange(1, i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Opponent row */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
            <div className="space-y-1.5">
              <Label>Opponent</Label>
              <Input
                value={match.player2_name ?? ""}
                onChange={(e) => setMatch((prev) => (prev ? { ...prev, player2_name: e.target.value } : prev))}
                placeholder="Opponent Name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Game Score</Label>
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    className="w-12 text-center"
                    value={p2Scores[i] ?? 0}
                    onChange={(e) => onScoreChange(2, i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={confirmChanges} disabled={saving}>
          {saving ? "Saving..." : "Confirm Changes"}
        </Button>
      </div>
    </div>
  );
}

export default ConfirmMatch;

// Helpers for score mapping: assume player1 is winner per set.
function scoresFromScoreObject(score: any) {
  if (!score || typeof score !== "object") return { playerScores: [], opponentScores: [] };
  const entries = Object.entries(score)
    .filter(([k]) => /^\d+$/.test(k))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  const playerScores: number[] = [];
  const opponentScores: number[] = [];
  for (const [, setAny] of entries) {
    const set = (setAny ?? {}) as { winner?: number; loser?: number };
    const w = toNumber(set.winner);
    const l = toNumber(set.loser);
    playerScores.push(w);
    opponentScores.push(l);
  }
  return { playerScores, opponentScores };
}

function scoreObjectFromArrays(p1: number[], p2: number[]) {
  const out: Record<string, any> = {};
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = toNumber(p1[i]);
    const b = toNumber(p2[i]);
    if (!a && !b) continue;
    out[String(i + 1)] = { winner: a, loser: b, tiebreak: null, winnerTiebreak: null };
  }
  return out;
}

function toNumber(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fillToThree(arr: number[]) {
  const out = [...arr];
  while (out.length < 3) out.push(0);
  return out.slice(0, 3);
}

