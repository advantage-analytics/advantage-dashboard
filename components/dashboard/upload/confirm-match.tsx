"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        setMatch(data as MatchData);
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

  const updateField = useCallback(
    async (field: string, value: any) => {
      if (!matchId) return;
      try {
        const { error } = await supabase
          .from("matches")
          .update({ [field]: value })
          .eq("id", matchId);
        if (error) throw error;
        setMatch((prev) => (prev ? { ...prev, [field]: value } : prev));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Update error:", e);
      }
    },
    [matchId, supabase],
  );

  const updateScore = useCallback(
    async (playerIndex: 1 | 2, gameIndex: number, value: string) => {
      if (!matchId || !match) return;
      const newScore = { ...(match.score || {}) };
      // For simplicity, assume score structure allows direct game indexing
      // Adjust based on your actual score schema
      if (!newScore[gameIndex + 1]) newScore[gameIndex + 1] = {};
      
      // Simple approach: store as player1/player2 keys per game
      newScore[gameIndex + 1][`player${playerIndex}`] = parseInt(value) || 0;
      
      await updateField("score", newScore);
    },
    [matchId, match, updateField],
  );

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
              onChange={(e) => updateField("tournament_name", e.target.value)}
              placeholder="Tournament Name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="round">Round</Label>
            <Input
              id="round"
              value={match.round ?? ""}
              onChange={(e) => updateField("round", e.target.value)}
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
            <Input
              id="best-of"
              value={match.best_of ?? ""}
              onChange={(e) => updateField("best_of", parseInt(e.target.value) || null)}
              placeholder="3 Sets"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="ad-scoring"
              checked={match.ad_scoring ?? false}
              onChange={(e) => updateField("ad_scoring", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="ad-scoring" className="cursor-pointer">Ad Scoring</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="play-on-lets"
              checked={match.play_on_lets ?? false}
              onChange={(e) => updateField("play_on_lets", e.target.checked)}
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
                onChange={(e) => updateField("player1_name", e.target.value)}
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
                    value={match.score?.[i + 1]?.player1 ?? 0}
                    onChange={(e) => updateScore(1, i, e.target.value)}
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
                onChange={(e) => updateField("player2_name", e.target.value)}
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
                    value={match.score?.[i + 1]?.player2 ?? 0}
                    onChange={(e) => updateScore(2, i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmMatch;

