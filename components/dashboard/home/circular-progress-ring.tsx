// Circular Progress Ring Component
export function CircularProgressRing({
  wins,
  losses,
}: {
  wins: number;
  losses: number;
}) {
  const total = wins + losses;
  // When total is 0, show 0% (empty ring)
  const winPercentage = total > 0 ? (wins / total) * 100 : 0;

  // Calculate the stroke-dasharray for the progress
  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference - (winPercentage / 100) * circumference;

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg className="transform -rotate-90 w-32 h-32" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#E5E5E5"
            strokeWidth="8"
          />
          {/* Progress circle - only show if there's progress */}
          {winPercentage > 0 && (
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#4A90E2"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
      <div className="flex flex-col">
        <p className="text-3xl font-medium text-[#0D0D0D]">
          {wins}-{losses}
        </p>
        <p className="text-sm font-normal text-[#747474]">Overall Record</p>
      </div>
    </div>
  );
}
