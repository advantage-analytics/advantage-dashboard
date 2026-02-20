import type { Match } from "@/lib/data/types";

function shortName(name: string, maxLen = 14): string {
  if (name.length <= maxLen) return name;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;

  const last = parts[parts.length - 1];

  // Abbreviate middle names first
  if (parts.length > 2) {
    const midInitials = parts.slice(1, -1).map((m) => `${m[0]}.`);
    const result = [parts[0], ...midInitials, last].join(" ");
    if (result.length <= maxLen) return result;
  }

  // Then abbreviate first name too
  const midInitials = parts.slice(1, -1).map((m) => `${m[0]}.`);
  return [`${parts[0][0]}.`, ...midInitials, last].join(" ");
}

/* ── PlayerTabs ─────────────────────────────────────────────── */

interface PlayerTabsProps {
  match: Match;
  selectedPlayer: "player1" | "player2";
  onSelectPlayer: (p: "player1" | "player2") => void;
}

const PLAYER_COLORS = {
  player1: "#3986F3",
  player2: "#F38439",
} as const;

export function PlayerTabs({
  match,
  selectedPlayer,
  onSelectPlayer,
}: PlayerTabsProps) {
  return (
    <div className="flex flex-row shadow-[inset_0_-1px_0_0_#D9D9D9]">
      <button
        type="button"
        onClick={() => onSelectPlayer("player1")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player1"
            ? "text-[#3986F3] border-[#3986F3]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player1.name)}
      </button>
      <button
        type="button"
        onClick={() => onSelectPlayer("player2")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player2"
            ? "text-[#F38439] border-[#F38439]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player2.name)}
      </button>
    </div>
  );
}

/* ── WinningPercentageCircle ────────────────────────────────── */

interface WinningPercentageCircleProps {
  percentage: number;
  won: number;
  total: number;
  label: string;
  barColor: string;
}

export function WinningPercentageCircle({
  percentage,
  won,
  total,
  label,
  barColor,
}: WinningPercentageCircleProps) {
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-row py-3 items-center gap-4">
      <div className="relative w-[100px] h-[100px] shrink-0">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#D9D9D9"
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={barColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
      </div>
      <div className="flex flex-col justify-center gap-1">
        <span className="font-medium text-2xl leading-tight uppercase text-black">
          {percentage.toFixed(1)}%{" "}
          <span className="text-xs">{`(${won}/${total})`}</span>
        </span>
        <span className="text-sm font-normal text-[#999999]">{label}</span>
      </div>
    </div>
  );
}

/* ── SectionHeader ──────────────────────────────────────────── */

export function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252]">
      {children}
    </div>
  );
}

/* ── ViewMoreButton ─────────────────────────────────────────── */

interface ViewMoreButtonProps {
  showMore: boolean;
  onToggle: () => void;
}

export function ViewMoreButton({ showMore, onToggle }: ViewMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="block text-center text-xs font-medium text-[#999999] hover:text-[#666666] transition-colors"
    >
      {showMore ? "View less" : "View more"}
    </button>
  );
}

export { PLAYER_COLORS };
