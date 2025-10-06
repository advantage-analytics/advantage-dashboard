"use client";

import { useState } from "react";
import { SelectMatch, SelectMatchValue } from "@/components/dashboard/upload/select-match";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Client() {
  const [selected, setSelected] = useState<SelectMatchValue>(null);

  return (
    <div className="flex-1 w-full p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Select Match</h2>
        <p className="text-sm text-muted-foreground">Select a recent match or create a new match</p>
      </div>

      <SelectMatch value={selected} onChange={setSelected} />

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Match</CardTitle>
            <CardDescription>{formatHeader(selected)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamBadge logoUrl={selected.team_home_logo_url} />
                    <span className="truncate text-sm font-medium">
                      {selected.player_home ?? "Home"}
                    </span>
                  </div>
                  <span className="text-muted-foreground">vs</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamBadge logoUrl={selected.team_away_logo_url} />
                    <span className="truncate text-sm font-medium">
                      {selected.player_away ?? "Away"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold leading-none">{selected.score_home ?? "-"}</div>
                <div className="text-muted-foreground">{selected.score_away ?? "-"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeamBadge({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt="logo" className="h-6 w-6 rounded-full" />;
}

function formatHeader(m: NonNullable<SelectMatchValue>) {
  const left = [m.event_name ?? undefined, m.round ?? undefined]
    .filter(Boolean)
    .join(" | ");
  const time = m.started_at
    ? new Date(m.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;
  return [left, time].filter(Boolean).join(" • ");
}


