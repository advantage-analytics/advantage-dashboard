"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { FeaturedMatchCard } from "./featured-match-card";
import { ViewToggle, type MatchView } from "./view-toggle";
import { MatchesGrid } from "./matches-grid";

interface MatchesPageContentProps {
  matches: DisplayMatch[];
}

export function MatchesPageContent({ matches }: MatchesPageContentProps): React.JSX.Element {
  const [view, setView] = useState<MatchView>("gallery");

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
          <Inbox className="h-8 w-8 text-[#999999]" />
        </div>
        <p className="font-medium text-[#000000] mb-1">No matches yet</p>
        <p className="text-sm text-[#999999]">
          Upload your first match to see it here.
        </p>
      </div>
    );
  }

  const [featured, ...remaining] = matches;

  return (
    <div className="space-y-8">
      <FeaturedMatchCard match={featured} />

      {remaining.length > 0 && (
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-[#0D0D0D]">
                  All Matches
                </h2>
                <span className="text-sm text-[#999999]">
                  ({remaining.length})
                </span>
              </div>
              <p className="text-sm italic text-[#999999] mt-1">
                Browse all your recorded matches
              </p>
            </div>
            <ViewToggle view={view} onViewChange={setView} />
          </div>

          <MatchesGrid matches={remaining} view={view} />
        </div>
      )}
    </div>
  );
}
