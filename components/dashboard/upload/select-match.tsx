"use client";

// Component: SelectMatch
// Purpose:
// - Provide a debounced search UI for `matches` in Supabase
// - Filter by partial `player1_name` or `player2_name` (ilike)
// - Render cards inspired by the Recent Matches layout
// - Emit the selected match via `onChange`
// Behavior:
// - When search is empty, no results are shown (no initial fetch)
// - Score rendering assumes player 1 is the winner per set

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

// Narrow row shape used by the selector and display. Extend as needed.
type MatchRow = {
  id: string;
  player1_id: string | number | null;
  player1_name: string | null;
  player2_id: string | number | null;
  player2_name: string | null;
  date: string | null; // ISO date/time
  round: string | null;
  tournament_name: string | null;
  score: string | null;
};

// Public value type so consumers can store the chosen match.
export type SelectMatchValue = MatchRow | null;

// Simple controlled component: parent owns the selected value
// and receives updates via `onChange`.
export function SelectMatch({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: SelectMatchValue;
  onChange: (m: SelectMatchValue) => void;
  placeholder?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState(""); // current search input
  const [loading, setLoading] = useState(false); // fetch in-flight
  const [results, setResults] = useState<MatchRow[]>([]); // current page of results

  // Debounce the search to avoid sending a request on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Fetch recent matches filtered by query; hide results if query is empty.
  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      // If empty query, show nothing
      if (q.trim().length === 0) {
        setResults([]);
        return;
      }
      let req = supabase
        .from("matches")
        .select(
          "id,player1_id,player1_name,player2_id,player2_name,date,round,tournament_name,score",
        )
        .order("date", { ascending: false })
        .limit(20);

      const trimmed = q.trim();
      const like = `%${trimmed}%`;
      // Partial match on either player's name
      req = req.or(
        [`player1_name.ilike.${like}`, `player2_name.ilike.${like}`].join(",")
      );

      const { data, error } = await req;
      if (error) throw error;
      setResults(data as MatchRow[]);
    } catch (e) {
      // Non-fatal: show empty results on error but log for debugging.
      // eslint-disable-next-line no-console
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Do not fetch on mount; we only show results when the user types

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* Separator under search */}
      <div className="h-px w-full bg-gray-200" />

      {query.trim().length > 0 && (
        <div className="flex flex-col gap-2">
          {loading && (
            <div className="text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="text-sm text-muted-foreground">No matches</div>
          )}
          {results.map((match) => (
            <button
              key={match.id}
              className="text-left"
              onClick={() => onChange(match)}
            >
              <Card className={
                value?.id === match.id ? "border-primary" : undefined
              }>
                <CardContent className="py-4">
                  {/* Top meta line: Final Score | tournament | round  •  time */}
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>
                      Final Score
                      {match.tournament_name && match.round 
                        ? ` | ${match.tournament_name} Round of ${match.round}`
                        : match.tournament_name 
                        ? ` | ${match.tournament_name}`
                        : match.round 
                        ? ` | Round of ${match.round}`
                        : ""
                      }
                    </span>
                    <span>{formatTime(match.date)}</span>
                  </div>

                  {/* Lines for each player with per-set scores, similar to RecentMatches */}
                  {renderMatchRows(match)}
                </CardContent>
              </Card>
            </button>
          ))}
          {/* Separator below list */}
          <div className="h-px w-full bg-gray-200" />
        </div>
      )}
    </div>
  );
}

// Builds the small gray header line (round • time)
function formatHeader(m: MatchRow) {
  const left = [m.round ?? undefined].filter(Boolean).join(" | ");
  const time = m.date
    ? new Date(m.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;
  return [left, time].filter(Boolean).join(" • ");
}

// Accepts a variety of shapes returned for score and produces a compact string.
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

function formatTime(date: string | null): string | undefined {
  return date
    ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;
}

// Render two rows: player1 then player2 with their per-set scores
function renderMatchRows(m: MatchRow) {
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

// Convert the provided score object into per-set arrays for a given perspective.
// Assumption: perspectivePlayerIsPlayer1=true means player1's per-set score equals
// the `winner` value when that player won the set; otherwise equals `loser`.
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
    // Without player identity per set, we cannot know who is winner.
    // Default heuristic: assume player1 is the winner if winner > loser and player1 overall has more winning sets.
    // Here we map winner to player1 when perspectivePlayerIsPlayer1=true.
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

type NormalizedSet = { winner: number; loser: number };

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

export default SelectMatch;


