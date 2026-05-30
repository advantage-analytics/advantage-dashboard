import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getStatisticsPageData,
  getSelectableMatches,
} from "@/lib/data/statistics-server";
import { StatisticsPageContent } from "@/components/dashboard/statistics/statistics-page-content";

export default async function StatisticsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");

  const [initialData, allMatches] = await Promise.all([
    getStatisticsPageData(),
    getSelectableMatches(),
  ]);

  return (
    <div className="flex-1 w-full bg-white">
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
          Statistics
        </h1>
        <div className="mt-6">
          <StatisticsPageContent
            initialData={initialData}
            allMatches={allMatches}
          />
        </div>
      </div>
    </div>
  );
}
