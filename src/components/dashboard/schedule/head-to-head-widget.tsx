import { ResultMark } from "@/components/dashboard/result-mark";
import { formatEventDay } from "@/lib/schedule/format";
import {
  formatOpponentRecord,
  type OpponentDualHistory,
  type OpponentMeeting,
} from "@/lib/schedule/opponent-history";

/**
 * T6 — the rail's "Head-to-head" card: the record line, then one row per
 * prior meeting.
 *
 * No opponent name is printed: `formatOpponentRecord` already reads "you lead
 * 3–1" with no name attached, and the card sits directly under the event
 * page's own title, which already names the opponent. It once took a `school`
 * and an `opponentProgramId` for a footer link to the opponent detail page;
 * that page was deleted with the rest of the unfinished Opponents UI, so both
 * props went with the link. Restore them when it ships.
 *
 * Server-renderable and data-shaped, same as `TeamTotalsWidget`: `history`
 * and `meetings` arrive already computed (`opponent-history.ts`), so an
 * opponent with no prior duals (`history.played === 0`, `meetings: []`) is
 * the same render path as one with a long series, not a separate empty state.
 */
export function HeadToHeadWidget({
  history,
  meetings,
}: {
  history: OpponentDualHistory;
  meetings: OpponentMeeting[];
}) {
  return (
    <div className="surface-card min-w-0 px-5 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Head-to-head</span>
        <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
          {formatOpponentRecord(history)}
        </span>
      </div>

      {meetings.length > 0 ? (
        <div className="mt-1 flex flex-col">
          {meetings.map((meeting) => (
            <MeetingRow key={meeting.eventId} meeting={meeting} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[12px]" style={{ color: "var(--ink-500)" }}>
          No previous duals
        </p>
      )}
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: OpponentMeeting }) {
  return (
    <div className="flex h-[36px] items-center justify-between gap-3 text-[12px]">
      <span style={{ color: "var(--ink-600)" }}>
        {formatEventDay(meeting.startsOn)}
      </span>
      <span className="tabular flex items-center gap-2">
        <ResultMark won={meeting.won} />
        <span style={{ color: "var(--ink-900)" }}>
          {meeting.us}–{meeting.them}
        </span>
      </span>
    </div>
  );
}
