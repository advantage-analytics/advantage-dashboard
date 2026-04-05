interface PerformanceProfileDimension {
  label: string;
  current: number;
  previous: number;
}

interface PerformanceProfileProps {
  dimensions: PerformanceProfileDimension[];
}

function RadarChart({ dimensions }: { dimensions: PerformanceProfileDimension[] }) {
  const width = 320;
  const height = 200;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const maxRadius = 80;
  const rings = 4;
  const count = dimensions.length;

  // Angles: spread evenly across top semicircle (π to 2π mapped to 0→2π for full circle)
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2; // top

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * maxRadius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const buildPolygon = (values: number[]) => {
    return values
      .map((v, i) => {
        const pt = getPoint(i, v);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  };

  const currentValues = dimensions.map((d) => d.current);
  const previousValues = dimensions.map((d) => d.previous);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Concentric ring guides */}
      {Array.from({ length: rings }, (_, i) => {
        const r = ((i + 1) / rings) * maxRadius;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#F0F0F0"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const pt = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={pt.x}
            y2={pt.y}
            stroke="#F0F0F0"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Previous polygon (gray, dashed) */}
      {previousValues.some((v) => v > 0) && (
        <polygon
          points={buildPolygon(previousValues)}
          fill="rgba(170,170,170,0.08)"
          stroke="#CCCCCC"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}

      {/* Current polygon (blue) */}
      {currentValues.some((v) => v > 0) && (
        <polygon
          points={buildPolygon(currentValues)}
          fill="rgba(57,134,243,0.15)"
          stroke="#3986F3"
          strokeWidth={1.5}
        />
      )}

      {/* Current value dots */}
      {currentValues.map((v, i) => {
        if (v === 0) return null;
        const pt = getPoint(i, v);
        return (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={2.5}
            fill="#3986F3"
          />
        );
      })}
    </svg>
  );
}

export default function PerformanceProfile({
  dimensions,
}: PerformanceProfileProps) {
  const isEmpty = dimensions.every((d) => d.current === 0 && d.previous === 0);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[#E7E7E7] hover:scale-[1.008]">
      {/* Header */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          PERFORMANCE PROFILE
        </p>
      </div>
      <div className="h-px bg-[#F0F0F0]" />

      <div className="p-6 flex flex-col gap-4">
        {isEmpty ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[12px] text-[#999999]">
              Upload matches to build your profile
            </p>
          </div>
        ) : (
          <>
            {/* Radar chart */}
            <div className="flex justify-center">
              <RadarChart dimensions={dimensions} />
            </div>

            {/* Dimension labels */}
            <div className="flex flex-col gap-1">
              {dimensions.map((d) => (
                <p
                  key={d.label}
                  className="text-[8px] font-medium text-[#AAAAAA] tracking-[1px]"
                >
                  {d.label}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 pt-3 pb-4 px-5">
          <div className="flex items-center gap-1.5">
            <div className="w-[7px] h-[7px] rounded-full bg-[#3986F3]" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              CURRENT
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[7px] h-[7px] rounded-full bg-[#CCCCCC]" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              30D AGO
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
