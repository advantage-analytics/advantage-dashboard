import Link from "next/link";

interface MatchBreadcrumbsProps {
  tournamentName: string;
  player1Name: string;
  player2Name: string;
  variant?: "light" | "dark";
}

export function MatchBreadcrumbs({
  tournamentName,
  player1Name,
  player2Name,
  variant = "light",
}: MatchBreadcrumbsProps) {
  const muted = variant === "dark" ? "text-white/40 hover:text-white/60" : "text-[#888888] hover:text-[#666666]";
  const separator = variant === "dark" ? "text-white/30" : "text-[#888888]";
  const label = variant === "dark" ? "text-white/50" : "text-[#888888]";
  const active = variant === "dark" ? "text-white/80 underline" : "text-[#3B82F6] underline";

  return (
    <nav className="flex items-center gap-1 text-xs font-normal">
      <Link href="/dashboard/matches" className={`${muted} transition-colors`}>
        Matches
      </Link>
      <span className={separator}>/</span>
      <span className={label}>{tournamentName}</span>
      <span className={separator}>/</span>
      <span className={active}>
        {player1Name} vs {player2Name}
      </span>
    </nav>
  );
}
