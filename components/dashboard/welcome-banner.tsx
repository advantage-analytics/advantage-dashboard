interface WelcomeBannerProps {
  name?: string;
  school?: string;
  classYear?: string;
  itaRanking?: number | string;
  winStreak?: number | string;
  matchesClinched?: number | string;
}

export function WelcomeBanner({
  name = "Player Name",
  school = "School Name",
  classYear = "Class Year",
  itaRanking = "#00",
  winStreak = 0,
  matchesClinched = 0,
}: WelcomeBannerProps) {
  return (
    <div className="bg-white text-gray-900 border border-gray-200 p-6 rounded-lg mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Welcome, {name}</h1>
          <p>
            {school} | {classYear}
          </p>
        </div>

        <div className="flex items-center divide-x divide-gray-200">
          <div className="px-4 text-center first:pl-0">
            <div className="text-2xl font-semibold">{String(itaRanking).startsWith("#") ? itaRanking : `#${itaRanking}`}</div>
            <div className="text-sm text-gray-500">ITA Ranking</div>
          </div>
          <div className="px-4 text-center">
            <div className="text-2xl font-semibold">{winStreak}</div>
            <div className="text-sm text-gray-500">Win Streak</div>
          </div>
          <div className="px-4 text-center last:pr-0">
            <div className="text-2xl font-semibold">{matchesClinched}</div>
            <div className="text-sm text-gray-500">Match Clinched</div>
          </div>
        </div>
      </div>
    </div>
  );
}
