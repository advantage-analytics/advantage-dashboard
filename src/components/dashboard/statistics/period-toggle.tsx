"use client";

export type Period = "all" | "last10" | "last5";

interface PeriodToggleProps {
  value: Period;
  onChange: (period: Period) => void;
  matchCount: number;
}

const OPTIONS: { value: Period; label: string; minMatches: number }[] = [
  { value: "all", label: "All Time", minMatches: 1 },
  { value: "last10", label: "Last 10", minMatches: 3 },
  { value: "last5", label: "Last 5", minMatches: 3 },
];

export function PeriodToggle({ value, onChange, matchCount }: PeriodToggleProps) {
  const visible = OPTIONS.filter((o) => matchCount >= o.minMatches);
  if (visible.length <= 1) return null;

  return (
    <div
      className="flex items-center bg-[#F7F7F7] rounded-full p-0.5"
      role="radiogroup"
      aria-label="Time period"
    >
      {visible.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`px-3.5 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1 ${
              isActive
                ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                : "text-[#888888] hover:text-[#525252]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
