import { getStatisticsPageData, getSelectableMatches } from "@/lib/data/statistics-server";
import { StatisticsPageContent } from "@/components/dashboard/statistics/statistics-page-content";

export default async function StatisticsPage(): Promise<React.JSX.Element> {
  const [data, allMatches] = await Promise.all([
    getStatisticsPageData(),
    getSelectableMatches(),
  ]);

  return (
    <div className="flex-1 w-full bg-white min-h-screen">
      <div className="relative z-10 px-8 py-12 pt-[104px]">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[#0D0D0D] mb-1.5">
            Statistics
          </h1>
          <p className="text-sm text-[#999999]">
            Dive deep into your performance analytics and discover patterns to
            improve your game.
          </p>
        </div>

        <StatisticsPageContent initialData={data} allMatches={allMatches} />
      </div>
    </div>
  );
}
