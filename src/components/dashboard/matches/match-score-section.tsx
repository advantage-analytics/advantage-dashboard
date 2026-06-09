import type { DisplayMatch } from "@/lib/data/matches-list-types";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface PlayerScoreRowProps {
  playerName: string;
  isWinner: boolean;
  sets: DisplayMatch["score"]["sets"];
  playerKey: "player1" | "player2";
}

function PlayerScoreRow({
  playerName,
  isWinner,
  sets,
  playerKey,
}: PlayerScoreRowProps): React.JSX.Element {
  const opponentKey = playerKey === "player1" ? "player2" : "player1";

  return (
    <div className="flex flex-row justify-between items-center">
      <div className="flex flex-row items-center gap-4">
        <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[#BFBFBF]">
            {getInitials(playerName)}
          </span>
        </div>
        <p
          className={`font-semibold text-sm ${
            isWinner ? "text-[#0D0D0D]" : "text-[#B3B3B3]"
          }`}
        >
          {playerName}
        </p>
      </div>
      <div className="flex flex-row gap-4 font-semibold text-[18px]">
        {sets.map((set, idx) => (
          <p
            key={idx}
            className={
              set[playerKey] > set[opponentKey]
                ? "text-[#0D0D0D]"
                : "text-[#B3B3B3]"
            }
          >
            {set[playerKey]}
          </p>
        ))}
      </div>
    </div>
  );
}

interface MatchHeaderProps {
  matchContext?: string;
  round?: string;
  duration?: string;
  durationStyle?: "featured" | "default";
}

function MatchHeader({
  matchContext,
  round,
  duration,
  durationStyle = "default",
}: MatchHeaderProps): React.JSX.Element {
  const durationClassName =
    durationStyle === "featured"
      ? "rounded-[10px] px-1.5 py-0.5 text-xs font-medium bg-[#F3F3F3] text-[#888888]"
      : "rounded-[10px] px-1.5 py-0.5 text-xs font-medium bg-[#F3F3F3] text-[#888888] group-hover:bg-[#E5E5EA] group-hover:text-[#525252] transition-colors";

  return (
    <div className="flex flex-row justify-between items-center font-normal text-xs text-[#888888]">
      <div className="flex items-center gap-2">
        {matchContext && <p>{matchContext}</p>}
        {round && (
          <>
            <span className="w-px h-3 bg-[#888888]" />
            <p>{round}</p>
          </>
        )}
      </div>
      {duration && <span className={durationClassName}>{duration}</span>}
    </div>
  );
}

interface MatchScoreSectionProps {
  match: DisplayMatch;
  accentLineClassName?: string;
  durationStyle?: "featured" | "default";
}

export function MatchScoreSection({
  match,
  accentLineClassName = "w-0.5 bg-[#E5E5EA] group-hover:bg-[#CCCCCC] self-stretch rounded-full transition-colors",
  durationStyle = "default",
}: MatchScoreSectionProps): React.JSX.Element {
  return (
    <div className="pl-2 pr-4 py-3 flex flex-row gap-6">
      <div className={accentLineClassName} />
      <div className="flex flex-col space-y-4 flex-1">
        <MatchHeader
          matchContext={match.matchContext}
          round={match.round}
          duration={match.duration}
          durationStyle={durationStyle}
        />
        <div className="flex flex-col space-y-2">
          <PlayerScoreRow
            playerName={match.player1.name}
            isWinner={match.score.winner === "player1"}
            sets={match.score.sets}
            playerKey="player1"
          />
          <PlayerScoreRow
            playerName={match.player2.name}
            isWinner={match.score.winner === "player2"}
            sets={match.score.sets}
            playerKey="player2"
          />
        </div>
      </div>
    </div>
  );
}
