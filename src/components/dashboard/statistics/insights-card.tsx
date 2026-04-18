import { TrendingUp, TrendingDown, Target, Swords, Flame } from "lucide-react";
import type { StatisticsPageData } from "@/lib/data/statistics-server";
import type { TrendData, StatTrend } from "./trend-utils";
import type { LucideIcon } from "lucide-react";

interface InsightsCardProps {
  data: StatisticsPageData;
  trends: TrendData;
}

interface Insight {
  type: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  text: string;
}

function generateInsights(data: StatisticsPageData, trends: TrendData): Insight[] {
  const insights: Insight[] = [];

  const allTrends: { label: string; trend: StatTrend }[] = [
    { label: "Aces per match", trend: trends.aces! },
    { label: "Double faults per match", trend: trends.doubleFaults! },
    { label: "Winners per match", trend: trends.winners! },
    { label: "Unforced errors per match", trend: trends.unforcedErrors! },
    { label: "First serve %", trend: trends.firstServePct! },
    { label: "Break point conversion", trend: trends.breakPointsConvertedPct! },
    { label: "Serve rating", trend: trends.serveRating! },
    { label: "Return rating", trend: trends.returnRating! },
  ].filter((s) => s.trend != null);

  // Improvements: trending in the good direction
  const improvements = allTrends
    .filter((s) => {
      const { direction, isPositive } = s.trend;
      return (
        direction !== "flat" &&
        ((direction === "up" && isPositive) || (direction === "down" && !isPositive))
      );
    })
    .sort((a, b) => b.trend.delta - a.trend.delta);

  // Concerns: trending in the bad direction
  const concerns = allTrends
    .filter((s) => {
      const { direction, isPositive } = s.trend;
      return (
        direction !== "flat" &&
        ((direction === "down" && isPositive) || (direction === "up" && !isPositive))
      );
    })
    .sort((a, b) => b.trend.delta - a.trend.delta);

  if (improvements.length > 0) {
    const best = improvements[0];
    const verb = best.trend.direction === "up" ? "up" : "down";
    insights.push({
      type: "positive",
      icon: TrendingUp,
      text: `${best.label} trending ${verb} by ${best.trend.delta} over your last 5 matches`,
    });
  }

  if (concerns.length > 0) {
    const worst = concerns[0];
    const verb = worst.trend.direction === "up" ? "up" : "down";
    insights.push({
      type: "negative",
      icon: TrendingDown,
      text: `${worst.label} ${verb} by ${worst.trend.delta} — potential focus area`,
    });
  }

  // Rally strength
  const rallyData = [
    { label: "short rallies", pct: data.shortRallyWonPct, hint: "1–4 shots" },
    { label: "medium rallies", pct: data.mediumRallyWonPct, hint: "5–8 shots" },
    { label: "long rallies", pct: data.longRallyWonPct, hint: "9+ shots" },
  ].filter((r) => r.pct !== null);

  if (rallyData.length > 0) {
    const best = rallyData.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
    if (best.pct && best.pct >= 55) {
      insights.push({
        type: "neutral",
        icon: Swords,
        text: `Strongest in ${best.label} (${best.hint}) at ${best.pct}% win rate`,
      });
    }
  }

  // Positive error trends
  if (
    improvements.length === 0 &&
    (trends.doubleFaults?.direction === "down" || trends.unforcedErrors?.direction === "down")
  ) {
    const errorTrend = trends.doubleFaults?.direction === "down"
      ? { label: "Double faults", delta: trends.doubleFaults.delta }
      : { label: "Unforced errors", delta: trends.unforcedErrors!.delta };
    insights.push({
      type: "positive",
      icon: Target,
      text: `${errorTrend.label} declining by ${errorTrend.delta} per match — consistency improving`,
    });
  }

  // Win streak
  if (data.currentStreak.includes("W")) {
    const count = parseInt(data.currentStreak);
    if (count >= 3) {
      insights.push({
        type: "positive",
        icon: Flame,
        text: `${count}-match winning streak — momentum is building`,
      });
    }
  }

  // Fallback: no trends but good win rate
  if (insights.length === 0 && data.winRate >= 55) {
    insights.push({
      type: "positive",
      icon: TrendingUp,
      text: `Strong ${data.winRate}% win rate — your game is in great shape`,
    });
  }

  return insights.slice(0, 4);
}

const TYPE_COLORS = {
  positive: "text-[#5DB955]",
  negative: "text-[#E51837]",
  neutral: "text-[#3B82F6]",
};

const TYPE_BG = {
  positive: "bg-[rgba(93,185,85,0.06)]",
  negative: "bg-[rgba(229,24,55,0.06)]",
  neutral: "bg-[rgba(59,130,246,0.06)]",
};

export function InsightsCard({ data, trends }: InsightsCardProps) {
  const insights = generateInsights(data, trends);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Game Insights
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          {insights.length > 0
            ? "Based on your last 5 matches vs career"
            : "Play more matches to unlock insights"}
        </p>
      </div>

      {insights.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 p-3 rounded-xl ${TYPE_BG[insight.type]}`}
            >
              <insight.icon
                className={`size-3.5 shrink-0 mt-0.5 ${TYPE_COLORS[insight.type]}`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="text-[12px] font-normal text-[#525252] leading-[1.5]">
                {insight.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
