"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type MatchFile = {
  file_name: string | null;
  storage_path: string | null;
};

type MatchRow = {
  id: string;
  date: string;
  tournament_name: string | null;
  player1_name: string;
  player2_name: string;
  result: string | null;
  status: string | null;
  files: MatchFile[];
};

interface MatchesTableProps {
  userId: string;
  matches: MatchRow[];
}

export default function MatchesTable({ userId, matches }: MatchesTableProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreateReport = async (match: MatchRow) => {
    setProcessingId(match.id);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!match.files.length) {
        throw new Error("No uploaded files found for this match.");
      }

      // Use storage paths as file identifiers for the processing API
      const fileNames = match.files
        .map((f) => f.storage_path || f.file_name)
        .filter((v): v is string => Boolean(v));

      if (!fileNames.length) {
        throw new Error("No valid file paths found for this match.");
      }

      // Call the Edge Function using Supabase client
      const supabase = createClient();
      
      // Fetch source_provider from match record
      const { data: matchData } = await supabase
        .from('matches')
        .select('source_provider')
        .eq('id', match.id)
        .single();

      const { data, error: functionError } = await supabase.functions.invoke(
        "process-match",
        {
          body: {
            matchId: match.id,
            userId,
            fileNames,
            sourceProvider: matchData?.source_provider || null,
          },
        },
      );

      if (functionError) {
        throw new Error(functionError.message || "Failed to process match data.");
      }

      if (!data || !data.success) {
        throw new Error(data?.error || "Failed to process match data.");
      }

      setSuccessMessage("Report processing completed successfully.");
      setCompletedIds((prev) => new Set(prev).add(match.id));
    } catch (e: any) {
      setError(e?.message || "Failed to start report processing.");
    } finally {
      setProcessingId(null);
    }
  };

  if (!matches.length) {
    return (
      <p className="text-sm text-muted-foreground mt-6">
        You don&apos;t have any matches yet.
      </p>
    );
  }

  return (
    <div className="w-full mt-8 space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#E5E5E5] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#F9FAFB] text-xs text-[#6B7280]">
            <tr>
              <th className="px-4 py-3 font-normal">Date</th>
              <th className="px-4 py-3 font-normal">Tournament</th>
              <th className="px-4 py-3 font-normal">Players</th>
              <th className="px-4 py-3 font-normal">Result</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const isProcessing = processingId === match.id;
              const isCompleted = completedIds.has(match.id);

              return (
                <tr
                  key={match.id}
                  className="border-t border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors"
                >
                  <td className="px-4 py-3 align-middle text-xs text-[#111827]">
                    {new Date(match.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-[#111827]">
                    {match.tournament_name || "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-[#4B5563]">
                    <div className="flex flex-col">
                      <span>{match.player1_name}</span>
                      <span className="text-[11px] text-[#9CA3AF]">
                        vs {match.player2_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-[#111827]">
                    {match.result || "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-[#6B7280]">
                    {match.status || "uploaded"}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-right">
                    <div className="flex flex-col items-end gap-2">
                      {isProcessing && (
                        <div className="w-32">
                          <Progress indeterminate className="h-1.5" />
                        </div>
                      )}
                      {isCompleted && !isProcessing && (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Completed</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="h-7 rounded-full px-3 text-[11px]"
                        onClick={() => handleCreateReport(match)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            Processing...
                          </>
                        ) : isCompleted ? (
                          "Process Again"
                        ) : (
                          "Create Report"
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

