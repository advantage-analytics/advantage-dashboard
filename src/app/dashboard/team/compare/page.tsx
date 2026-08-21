import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getComparablePlayers,
  getPlayerComparison,
} from "@/lib/data/team-compare-server";
import { ComparePicker } from "@/components/dashboard/team/compare-picker";
import { CompareTable } from "@/components/dashboard/team/compare-table";

export const metadata = { title: "Compare" };

/**
 * Two players, the same measures.
 *
 * The last of the coach's rail items to be a placeholder, and the one that
 * answers a question nothing else in the product does. A match page says how a
 * match went; Statistics says how one person is trending. Neither says which of
 * two players on the same squad is holding serve better — which is what a
 * lineup decision actually turns on.
 *
 * Selection lives in `?a=` and `?b=` rather than in component state, so the
 * screen can be sent to an assistant as a link.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const { a, b } = await searchParams;
  const players = await getComparablePlayers(active.id);

  // Ids from the URL are untrusted — they arrive from whatever someone typed.
  // Narrowing them to people who actually appear in this program's matches is
  // what stops the page rendering a column for a stranger's id; the queries
  // behind it are RLS-scoped besides, so a forged id returns nothing either way.
  const known = new Set(players.map((p) => p.userId));
  const leftId = a && known.has(a) ? a : null;
  const rightId = b && known.has(b) ? b : null;
  const samePerson = leftId !== null && leftId === rightId;

  const pair =
    leftId && rightId && !samePerson
      ? await getPlayerComparison(active.id, [leftId, rightId])
      : [];

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-light leading-[1.2] tracking-[-0.4px] text-[var(--ink-900)]">
            Compare
          </h1>
          <p className="max-w-[56ch] text-[13px] leading-[1.6] text-[var(--ink-700)]">
            Two players, the same measures, across every match the program has
            logged. Rates rather than totals, so a season of fourteen matches
            compares against a season of three.
          </p>
        </div>

        {players.length < 2 ? (
          <EmptyCompare count={players.length} />
        ) : (
          <>
            <ComparePicker
              players={players}
              leftId={leftId}
              rightId={rightId}
            />

            {samePerson ? (
              <Note>Pick two different people to compare.</Note>
            ) : pair.length === 2 ? (
              <CompareTable left={pair[0]} right={pair[1]} />
            ) : (
              <Note>Choose a player on each side to see the comparison.</Note>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-medium)] px-[18px] py-8 text-center">
      <p className="text-[13px] text-[var(--ink-700)]">{children}</p>
    </div>
  );
}

/**
 * Nothing to compare yet, and the reason matters.
 *
 * One player with matches is a different situation from none, and telling them
 * apart is the difference between "keep going" and "something is wrong".
 */
function EmptyCompare({ count }: { count: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-medium)] px-[18px] py-12 text-center">
      <p className="text-[15px] text-[var(--ink-900)]">
        {count === 0
          ? "No matches on the program yet"
          : "One player has matches so far"}
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-[1.6] text-[var(--ink-700)]">
        {count === 0
          ? "Send a couple of matches and this fills in. Comparison needs two players with a match each."
          : "Once a second player has a match logged, they can be compared here."}
      </p>
    </div>
  );
}
