import Link from "next/link";

interface MatchBreadcrumbsProps {
  tournamentName: string;
  player1Name: string;
  player2Name: string;
}

export function MatchBreadcrumbs({
  tournamentName,
  player1Name,
  player2Name,
}: MatchBreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-xs font-normal">
      <Link
        href="/dashboard/matches"
        className="text-[#999999] hover:text-[#666666] transition-colors"
      >
        Matches
      </Link>
      <span className="text-[#999999]">/</span>
      <span className="text-[#999999]">{tournamentName}</span>
      <span className="text-[#999999]">/</span>
      <span className="text-[#3986F3] underline">
        {player1Name} vs {player2Name}
      </span>
    </nav>
  );
}
