import Link from "next/link";
import { Upload } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { PendingBar } from "@/components/dashboard/loading/pending";
import {
  ANALYSIS_LABEL,
  isWorking,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import type {
  AdminUploadHistoryResult,
  AdminUploadHistoryState,
} from "@/lib/admin/uploads/history";
import { advButton } from "@/lib/ui/adv-button";
import { reconcileAdminSubmissionAction } from "@/app/admin/uploads/history-actions";

const KINDS = {
  file: "SwingVision file",
  video: "Video",
  dual: "Dual results",
  tournament: "Tournament results",
  analysis_attachment: "Analysis attachment",
};
const COLUMNS = ["Date", "Team", "Kind", "What", "Added by", "State"];

export function historyHref(cursor: string) {
  return `/admin/uploads?${new URLSearchParams({ cursor })}`;
}

export function HistoryState({ state }: { state: AdminUploadHistoryState }) {
  const label =
    state === "partial"
      ? "Partially saved"
      : state === "pending"
        ? "Save pending"
        : state === "saved"
          ? "Saved"
          : state === "unknown"
            ? "State unavailable"
            : ANALYSIS_LABEL[state];
  const analysis = state in ANALYSIS_LABEL;
  const live = analysis && isWorking(state as AnalysisStatus);
  return (
    <StatusChip
      live={live}
      tone={
        state === "failed" || state === "derivation_failed"
          ? "loss"
          : live
            ? "blue"
            : "neutral"
      }
    >
      {label}
    </StatusChip>
  );
}

/**
 * A plain `<form action>` discards an action's return value, and React types
 * the prop as returning void; the action still returns the service result
 * unchanged for any caller that reads it.
 */
const reconcileFormAction = reconcileAdminSubmissionAction as unknown as (
  formData: FormData,
) => Promise<void>;

/** One reconciliation control: a server-action form, no client island. */
function ReconcileForm({
  operationId,
  itemId,
  mode,
  label,
}: {
  operationId: string;
  itemId: string;
  mode: "abandon" | "complete";
  label: string;
}) {
  return (
    <form action={reconcileFormAction}>
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="mode" value={mode} />
      <button type="submit" className={advButton("outline", "sm")}>
        {label}
      </button>
    </form>
  );
}

export function AdminUploadHistory({
  result,
  cursor = null,
  loading = false,
}: {
  result?: AdminUploadHistoryResult;
  cursor?: string | null;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-display">Uploads</h1>
          <p className="text-body-sm mt-[9px]">
            Submission history from the admin console.
          </p>
        </div>
        <div className="flex-1" />
        <Link href="/admin/uploads/new" className={advButton("primary", "md")}>
          <Upload className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Upload for a team
        </Link>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[1080px] table-fixed text-left">
          <colgroup>
            {[130, 190, 140, undefined, 160, 170].map((width, i) => (
              <col key={i} style={width ? { width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border-hairline)]">
              {COLUMNS.map((label) => (
                <th
                  key={label}
                  className="eyebrow-sm px-5 pt-4 pb-3 font-medium"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} aria-hidden="true">
                  {COLUMNS.map((label) => (
                    <td key={label} className="h-[52px] px-5">
                      <PendingBar className="h-3 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : result?.ok ? (
              result.rows.length ? (
                result.rows.map((row) => (
                  <tr key={row.operationId} className="align-top">
                    <td className="px-5 py-4 text-[12px] text-[var(--ink-700)] tabular-nums">
                      <time className="whitespace-nowrap" dateTime={row.date}>
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(row.date))}
                      </time>
                    </td>
                    <td className="px-5 py-4 text-[13px] font-medium text-[var(--ink-900)]">
                      {row.team.name}
                      {row.team.side && (
                        <p className="mt-1 text-[11px] font-normal text-[var(--ink-500)]">
                          {row.team.side === "mens"
                            ? "Men’s tennis"
                            : row.team.side === "womens"
                              ? "Women’s tennis"
                              : row.team.side}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-[var(--ink-600)]">
                      {KINDS[row.kind]}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-[var(--ink-700)]">
                      <p>{row.what}</p>
                      {row.items.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-[var(--ink-500)]">
                            {row.items.length === 1
                              ? "Submission details"
                              : `${row.items.length} items`}
                          </summary>
                          <ul className="mt-3 space-y-3">
                            {row.items.map((item) => (
                              <li key={item.itemId}>
                                <p>{item.what}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <HistoryState state={item.state} />
                                  {item.matchHref && (
                                    <Link
                                      className="text-[11px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
                                      href={item.matchHref}
                                    >
                                      Open match
                                    </Link>
                                  )}
                                </div>
                                {item.error && (
                                  <p className="mt-1 text-[11px] break-words text-[var(--ink-600)]">
                                    {item.error === "abandoned"
                                      ? "Abandoned by an administrator"
                                      : item.error}
                                  </p>
                                )}
                                {(item.reconcile.abandon ||
                                  item.reconcile.complete) && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {item.reconcile.complete && (
                                      <ReconcileForm
                                        operationId={row.operationId}
                                        itemId={item.itemId}
                                        mode="complete"
                                        label="Mark complete"
                                      />
                                    )}
                                    {item.reconcile.abandon && (
                                      <ReconcileForm
                                        operationId={row.operationId}
                                        itemId={item.itemId}
                                        mode="abandon"
                                        label={
                                          item.kind === "match"
                                            ? "Abandon and delete match"
                                            : "Abandon"
                                        }
                                      />
                                    )}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[12px] break-words text-[var(--ink-600)]">
                      {row.addedBy.name}
                    </td>
                    <td className="px-5 py-4">
                      <HistoryState state={row.state} />
                      {row.state === "partial" && (
                        <p className="mt-2 text-[11px] text-[var(--ink-500)]">
                          {row.counts.saved} saved · {row.counts.failed} failed
                          · {row.counts.pending} pending
                          {row.counts.unknown
                            ? ` · ${row.counts.unknown} unavailable`
                            : ""}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-[13px] text-[var(--ink-900)]">
                      {cursor
                        ? "No older submissions"
                        : "No console submissions yet"}
                    </p>
                    <p className="mt-2 text-[12px] text-[var(--ink-500)]">
                      {cursor
                        ? "Return to the newest history page."
                        : "Files, videos and results submitted for a team will appear here."}
                    </p>
                  </td>
                </tr>
              )
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12">
                  <div role="alert">
                    <p className="text-[13px] text-[var(--ink-900)]">
                      {result && !result.ok
                        ? result.message
                        : "Upload history is unavailable."}
                    </p>
                    <Link
                      href={
                        result &&
                        !result.ok &&
                        result.reason === "invalid-cursor"
                          ? "/admin/uploads"
                          : cursor
                            ? historyHref(cursor)
                            : "/admin/uploads"
                      }
                      className={`mt-4 ${advButton("outline", "sm")}`}
                    >
                      {result &&
                      !result.ok &&
                      result.reason === "invalid-cursor"
                        ? "Show newest submissions"
                        : "Try again"}
                    </Link>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && (
        <p role="status" className="sr-only">
          Loading upload history
        </p>
      )}
      {!loading && (
        <nav
          aria-label="Upload history pages"
          className="flex items-center gap-3"
        >
          {cursor && (
            <Link href="/admin/uploads" className={advButton("ghost", "sm")}>
              Newest submissions
            </Link>
          )}
          <div className="flex-1" />
          {result?.ok && result.nextCursor && (
            <Link
              href={historyHref(result.nextCursor)}
              className={advButton("outline", "sm")}
            >
              Older submissions
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
