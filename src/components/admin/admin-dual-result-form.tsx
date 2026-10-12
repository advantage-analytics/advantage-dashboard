"use client";

import { squadLabel } from "@/lib/data/squad";
import { useState, useTransition } from "react";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import {
  EVENT_FORMATS,
  EVENT_DOUBLES_FORMATS,
  formatLabel,
  doublesSetLabel,
  singlesFormatLabel,
  doublesFormatLabel,
} from "@/lib/schedule/format";
import {
  emptyDualLines,
  emptyScore,
  freezeDualRequest,
  retainSuccesses,
  validateDualDraft,
  type AdminDualContext,
  type AdminDualOption,
  type DualResultDraft,
} from "@/lib/admin/results/dual-form";
import type {
  AdminDualSubmissionInput,
  AdminDualSubmissionResult,
  AdminResultItemOutcome,
} from "@/lib/admin/results/types";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
import type { CreateDualInput } from "@/lib/schedule/write-types";
import { AdminResultReview } from "./admin-result-review";

const initialDual = (): CreateDualInput => ({
  opponent: "",
  opponentProgramKey: null,
  date: "",
  startsAtTime: null,
  site: "home",
  surface: "hard",
  bestOf: 3,
  adScoring: false,
  doublesGamesTo: 6,
  doublesAdScoring: false,
  lines: emptyDualLines(),
});
function seedDrafts(dual: CreateDualInput): DualResultDraft[] {
  return emptyDualLines().map((empty) => {
    const line = dual.lines.find((l) => l.slot === empty.slot) ?? empty;
    return {
      line,
      score: emptyScore(
        line.discipline === "doubles" ? 1 : dual.bestOf,
        line.opponentLabels.join(" / "),
      ),
      outcome: line.noPlayer
        ? "ours-forfeit"
        : line.opponentNoPlayer
          ? "theirs-forfeit"
          : "",
    };
  });
}
export function AdminDualResultForm({
  context,
  events,
  loadAction,
  submitAction,
  eventsError,
}: {
  context: AdminUploadContext;
  events: AdminDualOption[];
  eventsError?: string | null;
  loadAction: (
    programId: string,
    eventId: string,
  ) => Promise<
    { ok: true; context: AdminDualContext } | { ok: false; message: string }
  >;
  submitAction: (
    input: AdminDualSubmissionInput,
  ) => Promise<AdminDualSubmissionResult>;
}) {
  const [dual, setDual] = useState(initialDual);
  const [drafts, setDrafts] = useState(() => seedDrafts(dual));
  const [existing, setExisting] = useState<AdminDualContext | null>(null);
  const [selectedEvent, setSelectedEvent] = useState("new");
  const [request, setRequest] = useState<AdminDualSubmissionInput | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [statuses, setStatuses] = useState<AdminResultItemOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const checked = validateDualDraft(dual, drafts, existing);
  const savedCount = statuses.filter((s) => s.status === "succeeded").length;
  const complete = !!request && savedCount === request.items.length;
  const squad = squadLabel(context.workspace.team);
  const team = squad
    ? `${context.workspace.name} ${squad}`
    : context.workspace.name;
  function update(index: number, patch: Partial<DualResultDraft>) {
    setDrafts((old) =>
      old.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }
  function chooseEvent(value: string) {
    setSelectedEvent(value);
    setError(null);
    setExisting(null);
    if (value === "new") {
      const fresh = initialDual();
      setDual(fresh);
      setDrafts(seedDrafts(fresh));
      return;
    }
    setDrafts([]);
    startTransition(async () => {
      try {
        const loaded = await loadAction(context.workspace.id, value);
        if (!loaded.ok) {
          setError(loaded.message);
          return;
        }
        setExisting(loaded.context);
        setDual(loaded.context.dual);
        setDrafts(seedDrafts(loaded.context.dual));
      } catch {
        setError("We couldn’t load this dual. Choose it again to retry.");
      }
    });
  }
  function submit() {
    if (!request || pending || complete) return;
    setAttempted(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitAction(request);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.operationId !== request.operationId) {
          setError(
            "We couldn’t verify the response. Retry to recover saved results.",
          );
          return;
        }
        setStatuses((old) => retainSuccesses(old, result.items));
      } catch {
        setError(
          "The response was interrupted. Retry to recover saved results.",
        );
      }
    });
  }
  if (request)
    return (
      <div className="flex flex-col gap-6">
        <AdminResultReview
          team={team}
          event={`${dual.opponent} · ${dual.date}`}
          lines={request.items.map((item) => {
            const line = drafts.find((d) => d.line.slot === item.slot)!;
            return {
              id: item.itemId,
              label: item.slot,
              players: line.line.playerLabels.join(" / "),
              opponents: line.score.opponentName,
              result: item.result,
            };
          })}
          statuses={statuses}
        />
        {attempted && (
          <p role="status" className="text-[13px] text-[var(--ink-600)]">
            {pending
              ? "Saving results…"
              : complete
                ? `All ${savedCount} lines saved.`
                : `${savedCount} of ${request.items.length} lines saved. Your entries are retained; retry continues the unsaved lines.`}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          {!attempted && (
            <button
              type="button"
              className={advButton("ghost", "md")}
              onClick={() => setRequest(null)}
            >
              Back to edit
            </button>
          )}
          <button
            type="button"
            disabled={pending || complete}
            onClick={submit}
            className={advButton("primary", "md")}
          >
            {pending
              ? "Saving…"
              : complete
                ? "Saved"
                : attempted
                  ? "Retry unsaved lines"
                  : "Confirm results"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-[12px] text-[var(--ink-600)]">
        Event
        <select
          aria-label="Dual event"
          className={advField("boxed")}
          value={selectedEvent}
          disabled={pending}
          onChange={(e) => chooseEvent(e.target.value)}
        >
          <option value="new">Create a new dual</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </select>
      </label>
      {eventsError && (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {eventsError}
        </p>
      )}
      <p className="text-[12px] text-[var(--ink-600)]">
        {events.length === 100 ? "Showing the 100 most recent duals. " : ""}
        Scores are {team} first. Leave unplayed lines blank.
      </p>
      {pending && (
        <p role="status" className="text-[13px]">
          Loading dual…
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
      {existing?.format && (
        <p className="text-[12px] text-[var(--ink-600)]">
          {[
            singlesFormatLabel(existing.format),
            doublesFormatLabel(existing.format),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {selectedEvent === "new" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 flex flex-col gap-2 text-[12px]">
            Opposing team
            <input
              aria-label="Opposing team"
              className={advField("boxed")}
              value={dual.opponent}
              maxLength={200}
              onChange={(e) => setDual({ ...dual, opponent: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-[12px]">
            Date
            <input
              aria-label="Dual date"
              type="date"
              className={advField("boxed")}
              value={dual.date}
              onChange={(e) => setDual({ ...dual, date: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-[12px]">
            Site
            <select
              aria-label="Dual site"
              className={advField("boxed")}
              value={dual.site}
              onChange={(e) =>
                setDual({
                  ...dual,
                  site: e.target.value as CreateDualInput["site"],
                })
              }
            >
              {["home", "away", "neutral"].map((site) => (
                <option key={site} value={site}>
                  {site[0].toUpperCase() + site.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-2 text-[12px]">
            Singles format
            <select
              aria-label="Singles format"
              className={advField("boxed")}
              value={
                EVENT_FORMATS.find(
                  (f) =>
                    f.bestOf === dual.bestOf && f.adScoring === dual.adScoring,
                )?.value
              }
              onChange={(e) => {
                const f = EVENT_FORMATS.find(
                  (f) => f.value === e.target.value,
                )!;
                setDual({ ...dual, bestOf: f.bestOf, adScoring: f.adScoring });
                setDrafts((old) =>
                  old.map((d) =>
                    d.line.discipline === "singles"
                      ? {
                          ...d,
                          score: {
                            ...d.score,
                            playerScores: Array.from(
                              { length: f.bestOf },
                              (_, i) => d.score.playerScores[i] ?? null,
                            ),
                            opponentScores: Array.from(
                              { length: f.bestOf },
                              (_, i) => d.score.opponentScores[i] ?? null,
                            ),
                            playerTiebreaks: Array.from(
                              { length: f.bestOf },
                              (_, i) => d.score.playerTiebreaks[i] ?? null,
                            ),
                            opponentTiebreaks: Array.from(
                              { length: f.bestOf },
                              (_, i) => d.score.opponentTiebreaks[i] ?? null,
                            ),
                          },
                        }
                      : d,
                  ),
                );
              }}
            >
              {EVENT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {formatLabel({ ...f, doubles: null })}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-2 text-[12px]">
            Doubles format
            <select
              aria-label="Doubles format"
              className={advField("boxed")}
              value={
                EVENT_DOUBLES_FORMATS.find(
                  (f) =>
                    f.gamesTo === dual.doublesGamesTo &&
                    f.adScoring === dual.doublesAdScoring,
                )?.value
              }
              onChange={(e) => {
                const f = EVENT_DOUBLES_FORMATS.find(
                  (f) => f.value === e.target.value,
                )!;
                setDual({
                  ...dual,
                  doublesGamesTo: f.gamesTo,
                  doublesAdScoring: f.adScoring,
                });
              }}
            >
              {EVENT_DOUBLES_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {doublesSetLabel(f.gamesTo)} · {f.adScoring ? "Ad" : "No-ad"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {checked.errors.event && (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {checked.errors.event}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {drafts.map((draft, index) => {
          const { line, score } = draft;
          const locked = existing?.saved[line.slot];
          return (
            <div
              key={line.slot}
              className="flex flex-col gap-2"
              data-court={line.slot}
            >
              {(index === 0 || index === 3) && (
                <h3 className="pt-2 text-[12px] font-medium">
                  {line.discipline === "doubles" ? "Doubles" : "Singles"}
                </h3>
              )}
              <div className="grid grid-cols-[28px_1fr] items-start gap-3 sm:grid-cols-[28px_minmax(140px,1fr)_minmax(120px,1fr)_auto]">
                <span className="pt-2 text-[12px] text-[var(--ink-600)]">
                  {line.slot}
                </span>
                {existing ? (
                  <span className="pt-2 text-[13px]">
                    {line.playerLabels.join(" / ") || "No player"}
                  </span>
                ) : (
                  <div className="flex gap-1">
                    {Array.from(
                      { length: line.discipline === "doubles" ? 2 : 1 },
                      (_, playerIndex) => (
                        <select
                          key={playerIndex}
                          aria-label={`${line.slot} player ${playerIndex + 1}`}
                          className={`${advField("boxed", "sm")} min-w-0 flex-1`}
                          value={
                            line.noPlayer
                              ? "none"
                              : (line.playerUserIds[playerIndex] ?? "")
                          }
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id === "none") {
                              update(index, {
                                line: {
                                  ...line,
                                  playerUserIds: [],
                                  playerLabels: [],
                                  noPlayer: true,
                                },
                                outcome: "ours-forfeit",
                              });
                              return;
                            }
                            const ids = Array.from(
                              { length: line.discipline === "doubles" ? 2 : 1 },
                              (_, i) =>
                                i === playerIndex
                                  ? id
                                  : (line.playerUserIds[i] ?? ""),
                            );
                            update(index, {
                              line: {
                                ...line,
                                playerUserIds: ids,
                                playerLabels: ids.map(
                                  (id) =>
                                    context.roster.find(
                                      (p) => p.playerId === id,
                                    )?.name ?? "",
                                ),
                                noPlayer: false,
                              },
                              outcome: line.noPlayer ? "" : draft.outcome,
                            });
                          }}
                        >
                          <option value="">Choose player</option>
                          {context.roster.map((player) => (
                            <option
                              key={player.playerId}
                              value={player.playerId}
                            >
                              {player.name}
                            </option>
                          ))}
                          <option value="none">No player</option>
                        </select>
                      ),
                    )}
                  </div>
                )}
                {locked ? (
                  <>
                    <span className="pt-2 text-[13px] text-[var(--ink-600)]">
                      {line.opponentLabels.join(" / ")}
                    </span>
                    <span className="pt-2 text-[12px] text-[var(--ink-600)]">
                      {locked} · Coach-recorded · Read-only
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      aria-label={`${line.slot} opponents`}
                      placeholder={
                        line.discipline === "doubles"
                          ? "Opponent / partner"
                          : "Opponent"
                      }
                      className={advField("boxed", "sm")}
                      disabled={!!existing && line.opponentLabels.length > 0}
                      value={score.opponentName}
                      onChange={(e) =>
                        update(index, {
                          score: { ...score, opponentName: e.target.value },
                          line: existing
                            ? line
                            : {
                                ...line,
                                opponentLabels: e.target.value
                                  .split("/")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              },
                        })
                      }
                    />
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {!draft.outcome &&
                          score.playerScores.map((_, set) => (
                            <div key={set} className="flex items-center gap-1">
                              {(
                                ["playerScores", "opponentScores"] as const
                              ).map((field) => (
                                <input
                                  key={field}
                                  aria-label={`${line.slot} set ${set + 1} ${field === "playerScores" ? "our" : "opponent"} games`}
                                  type="number"
                                  min={0}
                                  max={99}
                                  className={`${advField("boxed", "sm")} w-10! px-1! text-center`}
                                  value={score[field][set] ?? ""}
                                  aria-invalid={!!checked.errors[line.slot]}
                                  onChange={(e) =>
                                    update(index, {
                                      score: {
                                        ...score,
                                        [field]: score[field].map((n, i) =>
                                          i === set
                                            ? e.target.value === ""
                                              ? null
                                              : Number(e.target.value)
                                            : n,
                                        ),
                                      },
                                    })
                                  }
                                />
                              ))}
                            </div>
                          ))}
                      </div>
                      <select
                        aria-label={`${line.slot} result type`}
                        className={advField("boxed", "sm")}
                        value={draft.outcome || "score"}
                        onChange={(e) =>
                          update(index, {
                            outcome:
                              e.target.value === "score"
                                ? ""
                                : (e.target
                                    .value as DualResultDraft["outcome"]),
                          })
                        }
                      >
                        <option value="score">Score</option>
                        {(["theirs", "ours"] as const).flatMap((side) =>
                          (["forfeit", "default", "withdrawal"] as const).map(
                            (kind) => (
                              <option
                                key={`${side}-${kind}`}
                                value={`${side}-${kind}`}
                              >
                                {side === "ours" ? "Our side" : "Opponent"} ·{" "}
                                {kind}
                              </option>
                            ),
                          ),
                        )}
                      </select>
                      {!draft.outcome && (
                        <details className="text-[11px] text-[var(--ink-600)]">
                          <summary className="cursor-pointer">
                            Tiebreaks / stopped match
                          </summary>
                          <div className="mt-2 flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              {score.playerScores.map((_, set) => (
                                <div key={set} className="flex gap-1">
                                  {(
                                    [
                                      "playerTiebreaks",
                                      "opponentTiebreaks",
                                    ] as const
                                  ).map((field) => (
                                    <input
                                      key={field}
                                      type="number"
                                      min={0}
                                      max={999}
                                      aria-label={`${line.slot} set ${set + 1} ${field === "playerTiebreaks" ? "our" : "opponent"} tiebreak`}
                                      placeholder="TB"
                                      className={`${advField("boxed", "sm")} w-10! px-1!`}
                                      value={score[field][set] ?? ""}
                                      onChange={(e) =>
                                        update(index, {
                                          score: {
                                            ...score,
                                            [field]: score[field].map((n, i) =>
                                              i === set
                                                ? e.target.value === ""
                                                  ? null
                                                  : Number(e.target.value)
                                                : n,
                                            ),
                                          },
                                        })
                                      }
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                            <select
                              aria-label={`${line.slot} match ending`}
                              className={advField("boxed", "sm")}
                              value={score.ending ?? "played"}
                              onChange={(e) =>
                                update(index, {
                                  score: {
                                    ...score,
                                    ending:
                                      e.target.value === "played"
                                        ? null
                                        : (e.target.value as
                                            "retired" | "defaulted"),
                                    stoppedBy: null,
                                  },
                                })
                              }
                            >
                              <option value="played">Played out</option>
                              <option value="retired">Retired</option>
                              <option value="defaulted">Defaulted</option>
                            </select>
                            {score.ending && (
                              <select
                                aria-label={`${line.slot} stopped by`}
                                className={advField("boxed", "sm")}
                                value={score.stoppedBy ?? ""}
                                onChange={(e) =>
                                  update(index, {
                                    score: {
                                      ...score,
                                      stoppedBy: e.target.value as
                                        "ours" | "theirs",
                                    },
                                  })
                                }
                              >
                                <option value="">Choose who stopped</option>
                                <option value="ours">Our side</option>
                                <option value="theirs">Opponent</option>
                              </select>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </>
                )}
              </div>
              {checked.errors[line.slot] && (
                <p
                  role="alert"
                  className="pl-10 text-[12px] text-[var(--danger)]"
                >
                  {checked.errors[line.slot]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--ink-600)]">
          {checked.selected.length} lines to submit
        </p>
        <button
          type="button"
          disabled={!checked.valid || pending || drafts.length !== 9}
          className={advButton("primary", "md")}
          onClick={() =>
            setRequest(
              freezeDualRequest(
                context.workspace.id,
                dual,
                drafts,
                existing,
                () => crypto.randomUUID(),
              ),
            )
          }
        >
          Review results
        </button>
      </div>
    </div>
  );
}
