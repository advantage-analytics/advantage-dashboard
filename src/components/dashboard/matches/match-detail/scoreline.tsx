import { cn } from "@/lib/utils";
import type { Match, SetScore } from "@/lib/data/types";

interface ScorelineProps {
  match: Match;
  p1Name: string;
  p2Name: string;
}

export function Scoreline({ match, p1Name, p2Name }: ScorelineProps) {
  const sets = match.score.sets;
  if (sets.length === 0) return null;

  const p1SetsWon = sets.filter((s) => s.player1 > s.player2).length;
  const p2SetsWon = sets.filter((s) => s.player2 > s.player1).length;
  const winner = match.score.winner;

  return (
    <section
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-3"
      aria-label={`Final score: ${p1Name} ${p1SetsWon} sets, ${p2Name} ${p2SetsWon} sets`}
    >
      {/* Eyebrow */}
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
          Final Score
        </p>
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-[2.5px] leading-[15px]",
            match.won ? "text-[#5DB955]" : "text-[#E51837]",
          )}
        >
          {match.won ? "Won" : "Lost"}
        </span>
      </div>

      {/* Score table */}
      <div className="flex flex-col">
        {/* Set number headers — right-aligned */}
        <div className="flex items-center justify-end">
          {sets.map((_, i) => (
            <span
              key={i}
              className="w-12 text-center text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1px] leading-[15px]"
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* Player rows */}
        <PlayerRow
          name={p1Name}
          sets={sets}
          compareKey="player1"
          opposingKey="player2"
          isMatchWinner={winner === "player1"}
          hasBorder
        />
        <PlayerRow
          name={p2Name}
          sets={sets}
          compareKey="player2"
          opposingKey="player1"
          isMatchWinner={winner === "player2"}
          hasBorder={false}
        />
      </div>
    </section>
  );
}

function PlayerRow({
  name,
  sets,
  compareKey,
  opposingKey,
  isMatchWinner,
  hasBorder,
}: {
  name: string;
  sets: SetScore[];
  compareKey: "player1" | "player2";
  opposingKey: "player1" | "player2";
  isMatchWinner: boolean;
  hasBorder: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3",
        hasBorder && "border-b border-[#F3F3F3]",
      )}
    >
      <span
        className={cn(
          "text-[13px] leading-[20px] truncate",
          isMatchWinner
            ? "font-medium text-[#0D0D0D]"
            : "font-normal text-[#525252]",
        )}
      >
        {name}
      </span>
      <div className="flex items-center">
        {sets.map((set, i) => {
          const mine = set[compareKey];
          const theirs = set[opposingKey];
          const setWon = mine > theirs;
          return (
            <span
              key={i}
              className={cn(
                "w-12 text-center text-[20px] leading-[28px] tracking-[-0.3px] tabular-nums",
                setWon
                  ? "text-[#0D0D0D] font-normal"
                  : "text-[#AAAAAA] font-light",
              )}
            >
              {mine}
              {set.tiebreak && theirs > mine && (
                <sub className="text-[8px] font-medium text-[#AAAAAA] tracking-normal">
                  {theirs >= 7 ? mine : 0}
                </sub>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
