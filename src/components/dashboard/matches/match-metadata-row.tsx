import { Calendar, Crosshair, Swords } from "lucide-react";
import Image from "next/image";

interface MatchMetadataRowProps {
  date?: string;
  matchType?: string;
  courtType?: string;
  verificationStatus?: string;
  /** Hide the verified/unverified badge entirely — useful on pre-save screens
   *  where the concept of "verification" doesn't yet apply. */
  showVerification?: boolean;
}

export function MatchMetadataRow({
  date,
  matchType,
  courtType,
  verificationStatus,
  showVerification = true,
}: MatchMetadataRowProps): React.JSX.Element {
  return (
    <div className="flex flex-row gap-4 items-center">
      {date && (
        <div className="flex items-center gap-1">
          <Calendar className="size-[14px] text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-[10px] font-normal text-[#888888] leading-[16px]">{date}</p>
        </div>
      )}

      {(matchType === "Tournament" || matchType === "Dual Match" || matchType === "Practice") && (
        <div className="flex items-center gap-1">
          {matchType === "Tournament" ? (
            <Image
              src="/icons/tournament-icon.svg"
              alt=""
              width={14}
              height={14}
              aria-hidden="true"
            />
          ) : matchType === "Dual Match" ? (
            <Swords className="size-[14px] text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Crosshair className="size-[14px] text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
          )}
          <p className="text-[10px] font-normal text-[#888888] leading-[16px]">{matchType}</p>
        </div>
      )}

      {courtType && (
        <div className="flex items-center gap-1">
          <Image
            src="/icons/tennis-court-icon.svg"
            alt=""
            width={14}
            height={14}
            aria-hidden="true"
          />
          <p className="text-[10px] font-normal text-[#888888] leading-[16px]">{courtType}</p>
        </div>
      )}

      {showVerification && verificationStatus && (
        <div className="flex items-center gap-1">
          <Image
            src="/icons/verified-check-icon.svg"
            alt=""
            width={14}
            height={14}
            aria-hidden="true"
          />
          <p className="text-[10px] font-normal text-[#888888] leading-[16px]">
            {verificationStatus}
          </p>
        </div>
      )}
    </div>
  );
}
