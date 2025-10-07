"use client";

// Component: CreateMatch
// Purpose:
// - Allow creating a bare `matches` row by entering a specific numeric id
// - Optional fields: player ids, player names, and date
// - Shows the current user’s UTR ID for reference
// Behavior:
// - Validates numeric inputs; inserts and then calls `onCreated(id)` to continue flow

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function CreateMatch({ onCreated }: { onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [winnerId, setWinnerId] = useState("");
  const [loserId, setLoserId] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState("");
  const [loserName, setLoserName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = input.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Please enter a numeric match ID");
      return;
    }
    // validate optional winner/loser as numeric if provided
    if (winnerId && !/^\d+$/.test(winnerId.trim())) {
      setError("Winner must be a numeric ID");
      return;
    }
    if (loserId && !/^\d+$/.test(loserId.trim())) {
      setError("Loser must be a numeric ID");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const matchId = trimmed; // int8 stored as text; Supabase will coerce
      const payload: Record<string, any> = { id: matchId };
      if (winnerId) payload.player1_id = winnerId.trim();
      if (loserId) payload.player2_id = loserId.trim();
      if (winnerName) payload.player1_name = winnerName.trim();
      if (loserName) payload.player2_name = loserName.trim();
      if (dateStr) {
        const iso = new Date(dateStr).toISOString();
        payload.date = iso;
      }
      const { error } = await supabase.from("matches").insert(payload);
      if (error) throw error;
      setOpen(false);
      onCreated(matchId);
      setInput("");
      setWinnerId("");
      setLoserId("");
      setWinnerName("");
      setLoserName("");
      setDateStr("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create match");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentUserId(null);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("utr_id")
        .eq("id", user.id)
        .single();
      const utr = data?.utr_id ?? null;
      setCurrentUserId(utr !== null && utr !== undefined ? String(utr) : null);
    };
    void run();
  }, [supabase]);

  return (
    <div className="space-y-3">
      <div className="relative flex items-center justify-center">
        <div className="h-px w-full bg-gray-200" />
        <span className="absolute px-2 text-xs text-gray-400 bg-background">OR</span>
      </div>

      {!open ? (
        <Button className="w-full" onClick={() => setOpen(true)}>Create New Match</Button>
      ) : (
        <div className="space-y-2">
          {currentUserId && (
            <div className="text-xs text-muted-foreground">Your UTR ID: {currentUserId}</div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Enter numeric match ID"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "Confirm"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Winner (player1_id)"
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Loser (player2_id)"
              value={loserId}
              onChange={(e) => setLoserId(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Winner Name (player1_name)"
              value={winnerName}
              onChange={(e) => setWinnerName(e.target.value)}
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Loser Name (player2_name)"
              value={loserName}
              onChange={(e) => setLoserName(e.target.value)}
            />
          </div>
          <div>
            <input
              type="date"
              className="h-9 rounded-md border px-3 text-sm w-full"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}

export default CreateMatch;


