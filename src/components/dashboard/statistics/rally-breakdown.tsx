interface RallyBreakdownProps {
  shortPct: number | null;
  mediumPct: number | null;
  longPct: number | null;
}

interface RallyBarProps {
  label: string;
  hint: string;
  pct: number | null;
}

function RallyBar({ label, hint, pct }: RallyBarProps) {
  const display = pct !== null ? `${pct}%` : "—";
  const width = pct !== null ? `${pct}%` : "0%";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-[#0D0D0D]">{label}</span>
          <span className="text-[10px] text-[#CCCCCC]">{hint}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-[#0D0D0D]">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#3986F3] transition-all duration-500"
          style={{ width }}
        />
      </div>
    </div>
  );
}

export function RallyBreakdown({ shortPct, mediumPct, longPct }: RallyBreakdownProps) {
  const hasData = shortPct !== null || mediumPct !== null || longPct !== null;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-[#0D0D0D]">Rally Length Analysis</h2>
        <p className="text-xs text-[#999999] mt-0.5">
          {hasData ? "Win % by rally length" : "No rally data yet"}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <RallyBar label="Short Rally" hint="1–4 shots" pct={shortPct} />
        <RallyBar label="Medium Rally" hint="5–8 shots" pct={mediumPct} />
        <RallyBar label="Long Rally" hint="9+ shots" pct={longPct} />
      </div>
    </div>
  );
}
