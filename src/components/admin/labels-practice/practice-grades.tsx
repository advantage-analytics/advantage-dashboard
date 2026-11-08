"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatePill } from "@/components/ui/state-pill";
import type { PracticeCopyRow } from "@/lib/data/practice-server";
import {
  FIELD_LABELS,
  GRADED_FIELDS,
  filmClock,
  type GradedField,
} from "@/lib/services/labels/practice-grading";
import { DownloadCsvButton } from "./download-csv-button";

const FIELDS = ["boundary", ...GRADED_FIELDS] as const;

const STATUS_LABEL: Record<PracticeCopyRow["status"], string> = {
  labelling: "In progress",
  submitted: "Submitted",
  complete: "Complete",
};

function minutes(n: number): string {
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")} min`;
}

/** The summary CSV: one row per copy, with every field's tally. */
export function gradesCsv(copies: readonly PracticeCopyRow[]) {
  const header = [
    "labeller",
    "email",
    "status",
    "set",
    "submitted_at",
    "active_minutes",
    "accuracy_pct",
    "fixes_needed",
    "fixes_made",
    "missed_fixes",
    "new_errors",
    "key_points",
    "matched_points",
    ...FIELDS.flatMap((f) => [
      `${f}_checked`,
      `${f}_correct`,
      `${f}_missed`,
      `${f}_new`,
    ]),
  ];
  const rows = copies.map((copy) => {
    const g = copy.grade;
    return [
      copy.labeller?.name ?? "Unassigned",
      copy.labeller?.email ?? "",
      copy.status,
      copy.setNumber ?? "match",
      copy.submittedAt,
      copy.activeMinutes,
      g?.accuracy ?? null,
      g?.fixesNeeded ?? null,
      g?.fixesMade ?? null,
      g?.missedFixes ?? null,
      g?.newErrors ?? null,
      g?.keyPoints ?? null,
      g?.matched ?? null,
      ...FIELDS.flatMap((f) => {
        const t = g?.byField[f];
        return t
          ? [t.checked, t.correct, t.missedFixes, t.newErrors]
          : [null, null, null, null];
      }),
    ];
  });
  return [header, ...rows];
}

/** The detail CSV: every miss of every graded copy. */
export function missesCsv(copies: readonly PracticeCopyRow[]) {
  const rows: (string | number | null)[][] = [
    ["labeller", "film_time", "field", "kind", "expected", "got"],
  ];
  for (const copy of copies) {
    for (const miss of copy.grade?.misses ?? []) {
      rows.push([
        copy.labeller?.name ?? "Unassigned",
        filmClock(miss.at),
        FIELD_LABELS[miss.field],
        miss.kind === "missed_fix" ? "missed fix" : "new error",
        miss.expected,
        miss.got,
      ]);
    }
  }
  return rows;
}

const GRID =
  "grid grid-cols-[minmax(160px,1fr)_110px_90px_110px_80px_80px_100px_150px] items-center gap-x-4";

export function PracticeGrades({
  sourceSessionId,
  copies,
  remove,
}: {
  sourceSessionId: string;
  copies: readonly PracticeCopyRow[];
  remove: (
    sessionId: string,
    sourceSessionId: string,
  ) => Promise<{ ok: true } | { error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PracticeCopyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const graded = copies.filter((c) => c.grade);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          Copies and grades
        </h2>
        <div className="flex gap-2">
          <DownloadCsvButton
            filename={`practice-grades-${stamp}.csv`}
            rows={gradesCsv(copies)}
            disabled={copies.length === 0}
          />
          <DownloadCsvButton
            filename={`practice-misses-${stamp}.csv`}
            rows={missesCsv(graded)}
            label="Download misses"
            disabled={graded.length === 0}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      {copies.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-[13px] text-[var(--ink-900)]">
            No practice copies yet.
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
            A copy is graded here once its labeller submits it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <div className="min-w-[960px] px-6 pt-0.5 pb-1.5">
            <div
              className={`${GRID} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
            >
              <span className="eyebrow-sm">Labeller</span>
              <span className="eyebrow-sm">Status</span>
              <span className="eyebrow-sm text-right">Accuracy</span>
              <span className="eyebrow-sm text-right">Fixes caught</span>
              <span className="eyebrow-sm text-right">Missed</span>
              <span className="eyebrow-sm text-right">New errors</span>
              <span className="eyebrow-sm text-right">Active time</span>
              <span aria-hidden />
            </div>
            {copies.map((copy) => {
              const g = copy.grade;
              const expanded = open === copy.id;
              return (
                <Fragment key={copy.id}>
                  <div
                    className={`${GRID} min-h-[52px] border-b border-[var(--border-hairline)] text-[13px] last:border-b-0`}
                    data-practice-copy={copy.id}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1.5 text-left text-[var(--ink-900)] disabled:cursor-default"
                      disabled={!g}
                      aria-expanded={g ? expanded : undefined}
                      onClick={() => setOpen(expanded ? null : copy.id)}
                    >
                      {g ? (
                        expanded ? (
                          <ChevronDown
                            className="size-[13px] shrink-0 text-[var(--ink-400)]"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="size-[13px] shrink-0 text-[var(--ink-400)]"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                        )
                      ) : (
                        <span className="w-[13px] shrink-0" aria-hidden />
                      )}
                      <span className="truncate">
                        {copy.labeller?.name ?? "Unassigned"}
                      </span>
                    </button>
                    <span>
                      <StatePill>{STATUS_LABEL[copy.status]}</StatePill>
                    </span>
                    <span className="text-right text-[var(--ink-900)] tabular-nums">
                      {g ? `${g.accuracy}%` : "—"}
                    </span>
                    <span className="text-right text-[var(--ink-700)] tabular-nums">
                      {g ? `${g.fixesMade} of ${g.fixesNeeded}` : "—"}
                    </span>
                    <span className="text-right text-[var(--ink-700)] tabular-nums">
                      {g ? g.missedFixes : "—"}
                    </span>
                    <span className="text-right text-[var(--ink-700)] tabular-nums">
                      {g ? g.newErrors : "—"}
                    </span>
                    <span className="text-right text-[var(--ink-700)] tabular-nums">
                      {copy.activeMinutes > 0
                        ? minutes(copy.activeMinutes)
                        : "—"}
                    </span>
                    <span className="flex justify-end gap-4">
                      <Link
                        href={`/admin/labels/${copy.id}`}
                        className="text-[13px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        className="text-[13px] font-medium text-[var(--danger)] hover:opacity-80"
                        onClick={() => setDeleting(copy)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  {expanded && g && <GradeDetail grade={g} />}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this practice copy?"
        description={`${deleting?.labeller?.name ?? "This labeller"}’s copy and everything they labelled on it are deleted. The answer key and the match are not touched.`}
        confirmLabel="Delete copy"
        pendingLabel="Deleting…"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          if (!deleting) return;
          const target = deleting;
          setError(null);
          startTransition(async () => {
            const result = await remove(target.id, sourceSessionId);
            if ("error" in result) setError(result.error);
            setDeleting(null);
            router.refresh();
          });
        }}
      />
    </section>
  );
}

function GradeDetail({
  grade,
}: {
  grade: NonNullable<PracticeCopyRow["grade"]>;
}) {
  return (
    <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-page)] px-6 py-4">
      <p className="text-[12px] text-[var(--ink-500)]">
        {grade.matched} of {grade.keyPoints} key points lined up with a point on
        the copy.
      </p>
      <table className="mt-3 w-full max-w-[560px] text-[12px] tabular-nums">
        <thead>
          <tr className="text-left text-[var(--ink-500)]">
            <th className="py-1 font-normal">Field</th>
            <th className="py-1 text-right font-normal">Right</th>
            <th className="py-1 text-right font-normal">Missed</th>
            <th className="py-1 text-right font-normal">New errors</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => {
            const t = grade.byField[field as GradedField | "boundary"];
            if (t.checked === 0) return null;
            return (
              <tr key={field} className="text-[var(--ink-700)]">
                <td className="py-1">{FIELD_LABELS[field]}</td>
                <td className="py-1 text-right">
                  {t.correct} of {t.checked}
                </td>
                <td className="py-1 text-right">{t.missedFixes}</td>
                <td className="py-1 text-right">{t.newErrors}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {grade.misses.length > 0 && (
        <ul className="mt-3 flex max-h-[240px] flex-col gap-0.5 overflow-y-auto text-[12px] text-[var(--ink-700)]">
          {grade.misses.map((miss, i) => (
            <li key={i} className="tabular-nums">
              <span className="text-[var(--ink-500)]">
                {filmClock(miss.at)}
              </span>{" "}
              {FIELD_LABELS[miss.field]}: expected {miss.expected ?? "none"},
              got {miss.got ?? "none"}{" "}
              <span className="text-[var(--ink-500)]">
                ({miss.kind === "missed_fix" ? "missed fix" : "new error"})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
