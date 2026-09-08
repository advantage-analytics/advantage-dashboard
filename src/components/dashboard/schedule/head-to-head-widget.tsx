import Link from "next/link";
import { ResultMark } from "@/components/dashboard/result-mark";
import { formatEventDay } from "@/lib/schedule/format";
import {
  formatOpponentRecord,
  type OpponentDualHistory,
  type OpponentMeeting,
} from "@/lib/schedule/opponent-history";

/**
 * T6 — the rail's "Head-to-head" card: the record line, then one row per
 * prior meeting, then (only with an opponent program id) a link to the full
 * history.
 *
 * The `school` name is taken as a prop but never printed in the body —
 * `formatOpponentRecord` already reads "you lead 3–1" with no name attached,
 * and the card sits directly under the event page's own title, which already
 * names the opponent. `school` exists only for the footer link's copy.
 *
 * Server-renderable and data-shaped, same as `TeamTotalsWidget`: `history`
 * and `meetings` arrive already computed (`opponent-history.ts`), so an
 * opponent with no prior duals (`history.played === 0`, `meetings: []`) is
 * the same render path as one with a long series, not a separate empty state.
 */
export function HeadToHeadWidget({
  school,
  history,
  meetings,
  opponentProgramId,
}: {
  school: string;
  history: OpponentDualHistory;
  meetings: OpponentMeeting[];
  opponentProgramId: string | null;
}) {
  return (
    <div className="surface-card min-w-0 px-5 pb-4 pt-4">
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

      {opponentProgramId ? (
        <Link
          href={`/dashboard/opponents/${opponentProgramId}`}
          className="mt-2 inline-block text-[12px] font-medium"
          style={{ color: "var(--blue)" }}
        >
          All matches with {school} →
        </Link>
      ) : null}
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: OpponentMeeting }) {
  return (
    <div className="flex h-[36px] items-center justify-between gap-3 text-[12px]">
      <span style={{ color: "var(--ink-600)" }}>
        {formatEventDay(meeting.startsOn)}
      </span>
      <span className="flex items-center gap-2 tabular">
        <ResultMark won={meeting.won} />
        <span style={{ color: "var(--ink-900)" }}>
          {meeting.us}–{meeting.them}
        </span>
      </span>
    </div>
  );
}
