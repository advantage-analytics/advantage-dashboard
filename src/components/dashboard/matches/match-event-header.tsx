import { MoreVertical } from "lucide-react";
import { MatchMetadataRow } from "./match-metadata-row";

interface MatchEventHeaderProps {
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
}

export function MatchEventHeader({
  tournamentName,
  date,
  matchType,
  courtType,
  verificationStatus,
}: MatchEventHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Tournament Name Row */}
      <div className="flex flex-row justify-between items-center gap-2">
        <p className="text-xl font-medium text-[#0D0D0D]">{tournamentName}</p>
        <button className="p-1 rounded hover:bg-gray-100 transition-colors">
          <MoreVertical className="h-4 w-4 text-[#888888]" />
        </button>
      </div>

      <MatchMetadataRow
        date={date}
        matchType={matchType}
        courtType={courtType}
        verificationStatus={verificationStatus}
      />
    </div>
  );
}
