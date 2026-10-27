import { Calendar, Crosshair, Swords } from "lucide-react";
import Image from "next/image";
import {
  VERIFIED_BY_ADVANTAGE,
  type MatchVerification,
} from "@/lib/data/match-verification";

interface MatchMetadataRowProps {
  date?: string;
  matchType?: string;
  courtType?: string;
  /** Verified by Advantage (`verificationFor`), or null. */
  verification?: MatchVerification | null;
}

export function MatchMetadataRow({
  date,
  matchType,
  courtType,
  verification,
}: MatchMetadataRowProps): React.JSX.Element {
  // The v3 metadata row as the locked Platform Audit frames draw it: 13px
  // icons at --ink-400, `text-micro` labels (11px, --ink-500 — the token, not
  // a light-scope hex), 5px inside each pair and 14px between pairs. The date
  // is tabular so "Yesterday" and "Aug 21" hold their columns across rows.
  return (
    <div className="flex flex-row items-center gap-[14px]">
      {date && (
        <div className="flex items-center gap-[5px]">
          <Calendar
            className="size-[13px] text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-micro tabular">{date}</p>
        </div>
      )}

      {(matchType === "Tournament" ||
        matchType === "Dual Match" ||
        matchType === "Practice") && (
        <div className="flex items-center gap-[5px]">
          {matchType === "Tournament" ? (
            <Image
              src="/icons/tournament-icon.svg"
              alt=""
              width={13}
              height={13}
              aria-hidden="true"
            />
          ) : matchType === "Dual Match" ? (
            <Swords
              className="size-[13px] text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          ) : (
            <Crosshair
              className="size-[13px] text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          )}
          <p className="text-micro">{matchType}</p>
        </div>
      )}

      {courtType && (
        <div className="flex items-center gap-[5px]">
          <Image
            src="/icons/tennis-court-icon.svg"
            alt=""
            width={13}
            height={13}
            aria-hidden="true"
          />
          <p className="text-micro">{courtType}</p>
        </div>
      )}

      {verification && (
        <div className="flex items-center gap-[5px]">
          <Image
            src="/icons/verified-check-icon.svg"
            alt=""
            width={13}
            height={13}
            aria-hidden="true"
          />
          <p className="text-micro">{VERIFIED_BY_ADVANTAGE}</p>
        </div>
      )}
    </div>
  );
}
