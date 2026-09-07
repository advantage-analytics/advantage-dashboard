import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The recent-matches card on day zero: the shape of a result before there is
 * one, and the one action that produces one.
 *
 * Two ghost rows, not a centred icon-and-sentence. The shipped match row is
 * emptied and stepped down in opacity, so a player sees where the opponent,
 * the date and the three statistics will sit. The three labels stay readable —
 * what each row will report is real information; only the values become rules.
 *
 * Three rows, stepping down in opacity, no hairlines between them — the real
 * card draws none. Three is what the shipped card shows for a full event
 * group, so it is the shape the ghost is standing in for; cutting it to two
 * bought a page that fit 900px exactly, which is not worth showing a player a
 * shorter list than the one they will actually get.
 *
 * The rows carry no semantics at all (`aria-hidden`), because a row that
 * reports nothing is not a row. The band below them is the accessible content.
 */

const STAT_COLUMNS: readonly { label: string; width: string }[] = [
  { label: "1st serve", width: "64px" },
  { label: "Winners", width: "56px" },
  { label: "Errors", width: "52px" },
];

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div
      className="flex h-[52px] items-center gap-4"
      style={{ opacity }}
      aria-hidden="true"
    >
      <span className="size-[14px] shrink-0 rounded-full border-[1.5px] border-[var(--ink-200)]" />
      <span className="h-[9px] w-[170px] shrink-0 rounded-[2px] bg-[var(--ink-200)]" />
      <span className="h-[9px] w-[110px] shrink-0 rounded-[2px] bg-[var(--ink-100)]" />
      <div className="flex-1" />
      {/* The same `@2xl/matches` gate as the real row's stat cells, so the
          ghost row and the row that replaces it show and hide the same
          things at the same card width. */}
      <div className="hidden items-center gap-4 @2xl/matches:flex">
        {STAT_COLUMNS.map((column) => (
          <span
            key={column.label}
            className="flex shrink-0 flex-col items-end gap-1.5"
            style={{ width: column.width }}
          >
            <span className="eyebrow-sm whitespace-nowrap">{column.label}</span>
            <span className="h-2 w-6 rounded-[2px] bg-[var(--ink-100)]" />
          </span>
        ))}
      </div>
      {/* Where the row's chevron sits once the row is a link. */}
      <span className="flex-[0_0_13px]" />
    </div>
  );
}

export function RecentMatchesEmpty({
  showAction = true,
}: {
  /**
   * Off on the day-zero page, where the centred offer above the card is the
   * page's one action and this band would be the same ask a second time.
   */
  showAction?: boolean;
}) {
  return (
    <>
      {/* The fade runs 1 → 0.6 → 0.35 rather than in even steps: the drop
          from the first row to the second is what reads as "and so on", and
          the third only has to carry it far enough to stop. */}
      <div className="flex flex-col pt-2.5">
        {[1, 0.6, 0.35].map((opacity) => (
          <GhostRow key={opacity} opacity={opacity} />
        ))}
      </div>

      {/* The populated card's footer, in its geometry: what the list is a
          slice of. "0 matches" is a true figure, not a stand-in. */}
      <div className="mt-2.5 flex items-baseline gap-2.5 border-t border-[var(--border-hairline)] pt-3">
        <span className="text-micro" style={{ color: "var(--ink-600)" }}>
          Your latest matches appear here
        </span>
        <div className="flex-1" />
        <span className="whitespace-nowrap text-[11px] text-[var(--ink-600)]">
          <span className="tabular">0</span> matches
        </span>
      </div>

      {/*
       * One action, not two. The "Import a session" link that sat under this
       * button pointed at the same URL — both land on the wizard's provider
       * picker — so a second control was promising a door that does not exist.
       * The import path is named in the sentence instead, together with the
       * reason a SwingVision user would take it: none of the recording
       * requirements apply to them. It is the only route to a report inside the
       * same session, so it stays on the page; it stops pretending to be a
       * separate destination.
       *
       * The wizard now accepts `?source=swing-vision`, and the day-zero offer
       * carries that as a ghost button beside the primary — a second entrance
       * to one route, since the param preselects the Source field but cannot
       * skip step one, which also asks whose match this is.
       */}
      {showAction && (
      <div className="mt-3.5 flex items-center gap-5 border-t border-[var(--border-hairline)] pt-[22px] pb-1">
        <div className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-[1.4] text-[var(--ink-900)]">
            Nothing here until you send a match
          </span>
          <span
            className="text-body-sm mt-[3px] block"
            style={{ textWrap: "pretty" }}
          >
            A singles match, 1080p or better, camera fixed for the whole thing.
            Or import a SwingVision export, which needs none of that.
          </span>
        </div>
        <Link
          href="/dashboard/matches/new"
          className={`${advButton("primary")} shrink-0`}
        >
          Send a match
        </Link>
      </div>
      )}
    </>
  );
}
