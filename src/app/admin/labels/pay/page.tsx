import { AdminPage } from "@/components/admin/admin-page";
import { PayReportTable } from "@/components/admin/labels-practice/pay-report-table";
import { getLabelPayReport, parseDay } from "@/lib/data/practice-server";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";

/**
 * Admin › Labels › Pay report: hours of match video each labeller handed in
 * over a date range (UTC days, both ends included), split into submitted
 * (awaiting review) and approved (published), with practice sets counted
 * apart. Reviewers are paid per hour of match video. The range is in the URL
 * (`?from=&to=`) so a report can be linked; it defaults to this month so far.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Pay report" };

function thisMonth(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default async function LabelPayPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const fallback = thisMonth();
  let from = parseDay(params.from) ?? fallback.from;
  let to = parseDay(params.to) ?? fallback.to;
  if (from > to) [from, to] = [to, from];
  const report = await getLabelPayReport({ from, to });

  return (
    <AdminPage className="gap-6">
      <div>
        <h1 className="text-display">Pay report</h1>
        <p className="text-body-sm mt-[9px]">
          Hours of match video each labeller handed in, counted once on the day
          it was first submitted. Practice sets are not paid hours.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow-sm">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className={advField("boxed")}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow-sm">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className={advField("boxed")}
          />
        </label>
        <button type="submit" className={advButton("primary", "md")}>
          Show
        </button>
      </form>

      {report.ok ? (
        <PayReportTable
          from={from}
          to={to}
          rows={report.rows}
          lines={report.lines}
        />
      ) : (
        <p className="text-body-sm">Only an admin can see this page.</p>
      )}
    </AdminPage>
  );
}
