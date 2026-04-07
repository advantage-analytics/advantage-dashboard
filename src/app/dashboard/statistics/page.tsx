import { getStatisticsPageData, getSelectableMatches } from "@/lib/data/statistics-server";
import { StatisticsPageContent } from "@/components/dashboard/statistics/statistics-page-content";

export default async function StatisticsPage(): Promise<React.JSX.Element> {
  const [data, allMatches] = await Promise.all([
    getStatisticsPageData(),
    getSelectableMatches(),
  ]);

  return (
    <div className="flex-1 w-full bg-white">
      <div className="px-8 py-10">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-8">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            {allMatches.length} {allMatches.length === 1 ? "MATCH" : "MATCHES"} ANALYZED
          </p>
          <div>
            <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
              Statistics
            </h1>
            <p className="text-[12px] font-normal text-[#71717A] mt-1.5">
              Dive deep into your performance analytics and discover patterns to
              improve your game.
            </p>
          </div>
        </div>

        <StatisticsPageContent initialData={data} allMatches={allMatches} />
      </div>
    </div>
  );
}
