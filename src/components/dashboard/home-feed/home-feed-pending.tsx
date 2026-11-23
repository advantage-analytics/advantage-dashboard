import type { ReactNode } from "react";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { HomeListPending, TeamListsPending } from "./home-shape-memory";

/**
 * The page's two columns: the main column and a rail. The rail is 420px where
 * there is room and gives up to 60px back when the sidebar is open on a
 * laptop — the main column's rows carry more (a still, two names, a score, a
 * status) than the rail's do. Not below 360px: the pilot card's footer and
 * the numbers' trendlines need it.
 */
const COLUMNS =
  "grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(360px,33%,420px)]";

/**
 * The page's own column, shared by both Homes and their loading fallbacks —
 * the same gutters, top inset and section rhythm as Matches and Roster, and
 * like them it runs the full width of the content area.
 */
export function HomeFeedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-5 pb-8 xl:px-14">
        {children}
      </div>
    </div>
  );
}

/**
 * The top of the page: the action cards beside the pilot card, level with
 * each other.
 *
 * The pilot card can be absent — the pilot is over, or a personal account has
 * no allowance to show — and then the cards take the whole row rather than
 * sitting beside an empty rail. `pilot` is null when the page already knows;
 * a card that resolves to nothing leaves its slot empty, which the `:empty`
 * rules below collapse (React's streaming markers are comments, which
 * `:empty` ignores).
 */
export function TopRow({
  lead,
  pilot,
}: {
  lead: ReactNode;
  pilot: ReactNode | null;
}) {
  if (pilot === null) return <div className="min-w-0">{lead}</div>;
  return (
    <div
      className={`${COLUMNS} items-stretch xl:has-[>[data-rail]:empty]:grid-cols-1`}
    >
      <div className="min-w-0">{lead}</div>
      <div data-rail className="min-w-0 empty:hidden">
        {pilot}
      </div>
    </div>
  );
}

/**
 * The two lists. Nothing is stretched to level them (the design system's Home
 * rule): each card ends where its rows do.
 */
export function BottomRow({ children }: { children: ReactNode }) {
  return <div className={`${COLUMNS} items-start`}>{children}</div>;
}

export function TitlePending({ action }: { action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      {/* The loaded title's own two line boxes (`HomeTitle`): the heading's
          1.2em line, then a 20px line 4px beneath it — so the row under it
          does not move when the words land. */}
      <PendingRegion label="summary">
        <span className="text-title-lg flex h-[1.2em] items-center">
          <PendingBar className="h-5 w-56" />
        </span>
        <span className="mt-1 flex h-5 items-center">
          <PendingBar className="h-2.5 w-72" />
        </span>
      </PendingRegion>
      {action}
    </div>
  );
}

/** The pilot card's footprint, so nothing beside or below it moves. */
export function PilotPending() {
  return (
    <PendingRegion label="pilot" className="h-full min-h-[214px]">
      <PendingBar className="h-full min-h-[214px] w-full rounded-[var(--radius-card)]" />
    </PendingRegion>
  );
}

/** The three action cards' footprint beside the pilot card. */
export function TopPending({ pilot }: { pilot: ReactNode }) {
  return (
    <TopRow
      pilot={pilot}
      lead={
        <PendingRegion
          label="quick actions"
          className="h-full min-h-[214px]"
          innerClassName="grid h-full grid-cols-3 gap-5"
        >
          {[0, 1, 2].map((i) => (
            <PendingBar
              key={i}
              className="h-full min-h-[214px] w-full rounded-[var(--radius-card)]"
            />
          ))}
        </PendingRegion>
      }
    />
  );
}

/** A whole Home, loading — the route fallback for both workspaces. */
export function HomeFeedSkeleton({
  scope,
  action,
}: {
  scope: "personal" | "team";
  action?: ReactNode;
}) {
  return (
    <HomeFeedFrame>
      <TitlePending action={action} />
      <TopPending pilot={<PilotPending />} />
      <BottomRow>
        {scope === "team" ? (
          <TeamListsPending />
        ) : (
          <>
            <HomeListPending list="matches" />
            <HomeListPending list="numbers" />
          </>
        )}
      </BottomRow>
    </HomeFeedFrame>
  );
}
