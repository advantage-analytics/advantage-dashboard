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
          <span className="text-[12px] font-medium text-[#0D0D0D]">{label}</span>
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px]">{hint}</span>
        </div>
        <span className="text-[13px] font-light tabular-nums text-[#0D0D0D]">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
          style={{ width }}
        />
      </div>
    </div>
  );
}

export function RallyBreakdown({ shortPct, mediumPct, longPct }: RallyBreakdownProps) {
  const hasData = shortPct !== null || mediumPct !== null || longPct !== null;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[#E7E7E7] hover:scale-[1.008]">
      <div className="mb-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Rally Length Analysis
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
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
