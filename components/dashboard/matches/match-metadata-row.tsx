import { Calendar, GraduationCap } from "lucide-react";
import Image from "next/image";

interface MatchMetadataRowProps {
  date?: string;
  matchType?: string;
  courtType?: string;
  verificationStatus?: string;
}

export function MatchMetadataRow({
  date,
  matchType,
  courtType,
  verificationStatus,
}: MatchMetadataRowProps): React.JSX.Element {
  return (
    <div className="flex flex-row gap-4 items-center">
      {date && (
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3 text-[#999999]" />
          <p className="text-xs font-medium text-[#999999]">{date}</p>
        </div>
      )}

      {(matchType === "Tournament" || matchType === "Dual Match") && (
        <div className="flex items-center gap-1">
          {matchType === "Tournament" ? (
            <Image
              src="/icons/tournament-icon.svg"
              alt="Tournament"
              width={16}
              height={16}
            />
          ) : (
            <GraduationCap className="h-4 w-4 text-[#999999]" />
          )}
          <p className="text-xs font-medium text-[#999999]">{matchType}</p>
        </div>
      )}

      {courtType && (
        <div className="flex items-center gap-1">
          <Image
            src="/icons/tennis-court-icon.svg"
            alt="Court"
            width={16}
            height={16}
          />
          <p className="text-xs font-medium text-[#999999]">{courtType}</p>
        </div>
      )}

      <div className="flex items-center gap-1">
        <Image
          src="/icons/verified-check-icon.svg"
          alt="Check"
          width={16}
          height={16}
          className={verificationStatus ? "" : "grayscale"}
        />
        <p className="text-xs font-medium text-[#999999]">
          {verificationStatus || "Unverified Result"}
        </p>
      </div>
    </div>
  );
}
