"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToLabelTodoAction } from "@/app/admin/labels/actions";
import { Hours, LaneEmpty } from "@/components/label/label-board";
import { Checkbox } from "@/components/ui/checkbox";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { shortDate } from "@/lib/data/match-utils";
import type { TodoCandidate } from "@/lib/data/label-queue-server";
import { actionRejected } from "@/lib/ui/action-rejected";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Admin › Labels, under the lanes: every analysed match nobody is labelling
 * and nobody has added to the labellers' To do yet (`loadAdminLabels`),
 * newest first. The admin ticks the ones worth checking and adds them; a
 * row's own "Add to To do" adds just that one. Labellers never see this
 * list — only what it puts in To do.
 *
 * Design: "Labeller To-do Picker" canvas, option A. A table in the Matches
 * list's laws: Analysed leads, the match at 13/500, context at 12px, the
 * video hours in a fixed track, the row action revealed on hover and focus,
 * one primary in the toolbar, disabled until something is ticked.
 */

/** Rows shown before "Show N more". */
export const NOT_IN_TODO_VISIBLE = 25;

const ALL = "all";

const GRID =
  "grid grid-cols-[20px_64px_minmax(200px,320px)_minmax(0,220px)_64px_minmax(0,1fr)] items-center gap-x-4";

export function NotInTodoList({ rows }: { rows: readonly TodoCandidate[] }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<string>(ALL);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = useMemo<MenuOption<string>[]>(() => {
    const names = [...new Set(rows.map((row) => row.programName))].sort(
      (a, b) => a.localeCompare(b),
    );
    return [
      { value: ALL, label: "All workspaces" },
      ...names.map((name) => ({ value: name, label: name })),
    ];
  }, [rows]);

  const filtered =
    workspace === ALL
      ? rows
      : rows.filter((row) => row.programName === workspace);
  const visible = expanded ? filtered : filtered.slice(0, NOT_IN_TODO_VISIBLE);
  const hidden = filtered.length - visible.length;
  // Only ticked rows on screen are added: a row ticked while the list was
  // expanded, then hidden by a filter change that collapsed it, is not.
  const picked = visible.filter((row) => chosen.has(row.jobId));
  const allVisiblePicked =
    visible.length > 0 && visible.every((row) => chosen.has(row.jobId));

  function toggle(jobId: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (on) next.add(row.jobId);
        else next.delete(row.jobId);
      }
      return next;
    });
  }

  function add(jobIds: string[], key: string) {
    setError(null);
    setAdding(key);
    startTransition(async () => {
      const result = await addToLabelTodoAction(jobIds).catch(actionRejected);
      setAdding(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setChosen((current) => {
        const next = new Set(current);
        for (const id of jobIds) next.delete(id);
        return next;
      });
      router.refresh();
    });
  }

  const busy = pending && adding !== null;

  return (
    <section
      aria-labelledby="admin-labels-not-in-todo"
      data-labels-not-in-todo=""
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="admin-labels-not-in-todo"
            className="m-0 text-[13px] font-semibold text-[var(--ink-900)]"
          >
            Not in To do
          </h2>
          <p className="mt-1 text-[13px] text-[var(--ink-700)]">
            Analyzed matches nobody is labeling, newest first. Add the ones
            worth checking.
          </p>
        </div>
        {rows.length > 0 ? (
          <div className="flex items-center gap-2">
            <MenuSelect
              label="Workspace"
              value={workspace}
              options={options}
              onChange={(next) => {
                setWorkspace(next);
                setExpanded(false);
              }}
              align="end"
              scroll
            />
            <button
              type="button"
              data-labels-add-chosen=""
              disabled={picked.length === 0 || busy}
              onClick={() =>
                add(
                  picked.map((row) => row.jobId),
                  "chosen",
                )
              }
              className={advButton("primary", "sm")}
            >
              {adding === "chosen"
                ? "Adding…"
                : picked.length === 0
                  ? "Add to To do"
                  : `Add ${picked.length} to To do`}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <LaneEmpty>
          Every analyzed match is in To do, being labeled or already checked.
        </LaneEmpty>
      ) : filtered.length === 0 ? (
        <LaneEmpty>No match from this workspace is waiting.</LaneEmpty>
      ) : (
        <div
          role="table"
          aria-label="Matches not in To do"
          className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
        >
          <div className="min-w-[720px]">
            <div
              role="row"
              className={cn(
                GRID,
                "h-9 px-4 text-[12px] font-medium text-[var(--ink-500)]",
              )}
            >
              <span role="columnheader">
                <Checkbox
                  checked={allVisiblePicked}
                  onChange={toggleAll}
                  aria-label="Select every row shown"
                />
              </span>
              <span role="columnheader">Analyzed</span>
              <span role="columnheader">Match</span>
              <span role="columnheader">Workspace</span>
              <span role="columnheader">Video</span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {visible.map((row) => {
              const players = `${row.player1Name} vs ${row.player2Name}`;
              const on = chosen.has(row.jobId);
              return (
                <div
                  key={row.jobId}
                  role="row"
                  data-labels-candidate={row.jobId}
                  className={cn(
                    GRID,
                    "group h-[52px] border-t border-[var(--border-hairline)] px-4 transition-colors duration-[var(--duration-hover)] focus-within:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]",
                    on && "bg-[var(--surface-muted)]",
                  )}
                >
                  <span role="cell">
                    <Checkbox
                      checked={on}
                      onChange={(next) => toggle(row.jobId, next)}
                      aria-label={`Select ${players}`}
                    />
                  </span>
                  <span
                    role="cell"
                    className="text-[12px] text-[var(--ink-700)] tabular-nums"
                  >
                    {shortDate(row.completedAt)}
                  </span>
                  <span
                    role="cell"
                    className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]"
                  >
                    {players}
                  </span>
                  <span
                    role="cell"
                    className="min-w-0 truncate text-[12px] text-[var(--ink-600)]"
                  >
                    {row.programName}
                  </span>
                  <span role="cell">
                    <Hours seconds={row.videoSeconds} />
                  </span>
                  <span role="cell" className="justify-self-end">
                    <button
                      type="button"
                      data-labels-add={row.jobId}
                      disabled={busy}
                      onClick={() => add([row.jobId], row.jobId)}
                      aria-label={`Add ${players} to To do`}
                      className="h-7 rounded-[var(--radius-button)] px-2.5 text-[12px] font-medium text-[var(--blue)] opacity-0 transition-[opacity,color,background-color] duration-200 outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--surface-subtle)] hover:text-[var(--blue-hover)] focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-progress"
                    >
                      {adding === row.jobId ? "Adding…" : "Add to To do"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-[var(--radius-element)] px-1 text-[12px] font-medium text-[var(--ink-700)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
        >
          Show {hidden} more
        </button>
      ) : null}

      <p className="text-[12px] text-[var(--ink-500)]">
        A match you add is due 36 h from when you add it. Remove on a To do row
        puts it back here; once someone is labeling it, it stays theirs.
      </p>
    </section>
  );
}
