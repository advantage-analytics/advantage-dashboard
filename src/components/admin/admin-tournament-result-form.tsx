"use client";
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { emptyScore } from "@/lib/admin/results/dual-form";
import {
  freezeTournamentRequest,
  validateTournamentDraft,
  type AdminTournamentContext,
  type TournamentDraft,
} from "@/lib/admin/results/tournament-form";
import type {
  AdminTournamentSubmissionInput,
  AdminTournamentSubmissionResult,
} from "@/lib/admin/results/types";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
import {
  EVENT_FORMATS,
  formatLabel,
  ROUND_ORDER,
  roundLongLabel,
} from "@/lib/schedule/format";
import { AdminResultReview } from "./admin-result-review";
const fresh = (): TournamentDraft => ({
  tournament: {
    name: "",
    startsOn: "",
    endsOn: "",
    site: "neutral",
    surface: "hard",
    host: null,
    bestOf: 3,
    adScoring: false,
  },
  entryId: "",
  playerId: "",
  playerLabel: "",
  draw: "",
  seed: "",
  round: "R16",
  score: emptyScore(3),
  outcome: "",
});
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[12px] text-[var(--ink-600)]">
      <span>
        {label}
        {required && (
          <span aria-label="Required" className="ml-1 text-[var(--error)]">
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
export function AdminTournamentResultForm({
  context,
  events,
  eventsError,
  initialContext = null,
  initialEntry = "",
  initialRound = "R16",
  loadAction,
  submitAction,
}: {
  context: AdminUploadContext;
  events: { id: string; label: string }[];
  eventsError?: string | null;
  initialContext?: AdminTournamentContext | null;
  initialEntry?: string;
  initialRound?: string;
  loadAction: (
    programId: string,
    eventId: string,
  ) => Promise<
    | { ok: true; context: AdminTournamentContext }
    | { ok: false; message: string }
  >;
  submitAction: (
    input: AdminTournamentSubmissionInput,
  ) => Promise<AdminTournamentSubmissionResult & { resultHref?: string }>;
}) {
  const initial = fresh();
  if (initialContext) {
    initial.tournament = initialContext.tournament;
    initial.score = emptyScore(initial.tournament.bestOf);
    initial.round = ROUND_ORDER.includes(initialRound) ? initialRound : "R16";
    const entry = initialContext.entries.find((e) => e.id === initialEntry);
    if (entry) {
      initial.entryId = entry.id;
      initial.playerId = entry.playerId;
      initial.playerLabel = entry.label;
      initial.draw = entry.draw ?? "";
      initial.seed = entry.seed?.toString() ?? "";
    }
  }
  const [draft, setDraft] = useState(initial);
  const [existing, setExisting] = useState(initialContext);
  const [selected, setSelected] = useState(initialContext?.eventId ?? "new");
  const [request, setRequest] = useState<AdminTournamentSubmissionInput | null>(
    null,
  );
  const [response, setResponse] = useState<
    | (Extract<AdminTournamentSubmissionResult, { ok: true }> & {
        resultHref?: string;
      })
    | null
  >(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const entry = existing?.entries.find((e) => e.id === draft.entryId);
  const recorded =
    entry?.saved[draft.round] || (entry?.forfeit ? "Forfeit recorded" : null);
  const checked = validateTournamentDraft(draft, existing);
  const ready = selected === "new" || existing?.eventId === selected;
  const complete = response?.item.status === "succeeded";
  function chooseEvent(value: string) {
    setSelected(value);
    setExisting(null);
    setDraft(fresh());
    setError(null);
    if (value === "new") return;
    startTransition(async () => {
      try {
        const loaded = await loadAction(context.workspace.id, value);
        if (!loaded.ok) {
          setError(loaded.message);
          return;
        }
        setExisting(loaded.context);
        setDraft({
          ...fresh(),
          tournament: loaded.context.tournament,
          score: emptyScore(loaded.context.tournament.bestOf),
        });
      } catch {
        setError("We couldn’t load this tournament. Choose it again to retry.");
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
        if (
          result.operationId !== request.operationId ||
          result.item.itemId !== request.itemId ||
          result.item.round !== request.round
        ) {
          setError(
            "We couldn’t verify the response. Retry to recover your saved result.",
          );
          return;
        }
        setResponse(result);
      } catch {
        setError(
          "The response was interrupted. Retry the same operation to recover your result.",
        );
      }
    });
  }
  if (request)
    return (
      <div className="flex flex-col gap-6">
        <AdminResultReview
          team={context.workspace.name}
          event={draft.tournament.name}
          lines={[
            {
              id: request.itemId,
              label: request.round,
              players: draft.playerLabel,
              opponents: draft.score.opponentName,
              result: request.result,
            },
          ]}
          statuses={response ? [{ ...response.item, slot: request.round }] : []}
        />
        {attempted && (
          <p role="status" className="text-[13px] text-[var(--ink-600)]">
            {pending
              ? "Saving result…"
              : complete
                ? "Tournament result saved."
                : "Your entries are retained. Retry uses the same operation."}
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
              className={advButton("ghost", "md")}
              onClick={() => setRequest(null)}
            >
              Back to edit
            </button>
          )}
          {complete ? (
            <>
              <Link
                className={advButton("ghost", "md")}
                href={
                  response?.resultHref ??
                  `/admin/uploads/new?team=${context.workspace.id}&kind=tournament&event=${response!.eventId}&entry=${response!.entryId}&round=${request.round}`
                }
              >
                View result
              </Link>
              <Link
                className={advButton("primary", "md")}
                href="/admin/uploads"
              >
                Back to uploads
              </Link>
            </>
          ) : (
            <button
              className={advButton("primary", "md")}
              disabled={pending}
              onClick={submit}
            >
              {pending
                ? "Saving…"
                : attempted
                  ? "Retry result"
                  : "Confirm result"}
            </button>
          )}
        </div>
      </div>
    );
  const inputClass = advField("underline");
  return (
    <div className="flex flex-col gap-5">
      <Field label="Tournament" required>
        <select
          aria-label="Tournament"
          className={advField("boxed")}
          disabled={pending}
          value={selected}
          onChange={(e) => chooseEvent(e.target.value)}
        >
          <option value="new">Create a new tournament</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>
      {eventsError && (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {eventsError}
        </p>
      )}
      {events.length === 100 && (
        <p className="text-[12px] text-[var(--ink-600)]">
          Showing the 100 most recent tournaments.
        </p>
      )}
      {pending && <p role="status">Loading tournament…</p>}
      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
      {ready && (
        <>
          {selected === "new" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(["name", "startsOn", "endsOn", "surface", "host"] as const).map(
                (key) => (
                  <Field
                    key={key}
                    required={["name", "startsOn", "endsOn"].includes(key)}
                    label={
                      {
                        name: "Tournament name",
                        startsOn: "Start date",
                        endsOn: "End date",
                        surface: "Surface",
                        host: "Host",
                      }[key]
                    }
                  >
                    <input
                      aria-label={
                        {
                          name: "Tournament name",
                          startsOn: "Start date",
                          endsOn: "End date",
                          surface: "Surface",
                          host: "Host",
                        }[key]
                      }
                      type={
                        key === "startsOn" || key === "endsOn" ? "date" : "text"
                      }
                      data-focus-ring="none"
                      className={inputClass}
                      maxLength={key === "surface" ? 50 : 200}
                      value={draft.tournament[key] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          tournament: {
                            ...draft.tournament,
                            [key]:
                              key === "host"
                                ? e.target.value || null
                                : e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ),
              )}
              <Field label="Site" required>
                <select
                  aria-label="Tournament site"
                  className={advField("boxed")}
                  value={draft.tournament.site}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tournament: {
                        ...draft.tournament,
                        site: e.target
                          .value as TournamentDraft["tournament"]["site"],
                      },
                    })
                  }
                >
                  {["home", "away", "neutral"].map((v) => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Format" required>
                <select
                  aria-label="Tournament format"
                  className={advField("boxed")}
                  value={
                    EVENT_FORMATS.find(
                      (f) =>
                        f.bestOf === draft.tournament.bestOf &&
                        f.adScoring === draft.tournament.adScoring,
                    )?.value
                  }
                  onChange={(e) => {
                    const f = EVENT_FORMATS.find(
                      (f) => f.value === e.target.value,
                    )!;
                    setDraft({
                      ...draft,
                      tournament: {
                        ...draft.tournament,
                        bestOf: f.bestOf,
                        adScoring: f.adScoring,
                      },
                      score: emptyScore(f.bestOf, draft.score.opponentName),
                    });
                  }}
                >
                  {EVENT_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {formatLabel({ ...f, doubles: null })}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--ink-600)]">
              {draft.tournament.name} · {draft.tournament.startsOn}–
              {draft.tournament.endsOn} · Best of {draft.tournament.bestOf} ·{" "}
              {draft.tournament.adScoring === null
                ? "Scoring unspecified"
                : draft.tournament.adScoring
                  ? "Ad"
                  : "No-ad"}{" "}
              · Tournament details are read-only
            </p>
          )}
          {existing && (
            <Field label="Athlete entry" required>
              <select
                aria-label="Athlete entry"
                className={advField("boxed")}
                value={draft.entryId}
                onChange={(e) => {
                  const entry = existing.entries.find(
                    (x) => x.id === e.target.value,
                  );
                  setDraft({
                    ...draft,
                    entryId: entry?.id ?? "",
                    playerId: entry?.playerId ?? "",
                    playerLabel: entry?.label ?? "",
                    draw: entry?.draw ?? "",
                    seed: entry?.seed?.toString() ?? "",
                    score: emptyScore(draft.tournament.bestOf),
                    outcome: "",
                  });
                }}
              >
                <option value="">Create a new entry</option>
                {existing.entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                    {e.draw ? ` · ${e.draw}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Player" required>
              {entry ? (
                <span className="py-2 text-[13px] text-[var(--ink-900)]">
                  {entry.label} · Read-only
                </span>
              ) : (
                <select
                  aria-label="Player"
                  className={advField("boxed")}
                  value={draft.playerId}
                  onChange={(e) => {
                    const p = context.roster.find(
                      (p) => p.playerId === e.target.value,
                    );
                    setDraft({
                      ...draft,
                      playerId: p?.playerId ?? "",
                      playerLabel: p?.name ?? "",
                    });
                  }}
                >
                  <option value="">Choose player</option>
                  {context.roster
                    .filter(
                      (p) =>
                        !existing?.entries.some(
                          (e) => e.playerId === p.playerId,
                        ),
                    )
                    .map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.name}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            {(["draw", "seed"] as const).map((key) => (
              <Field key={key} label={key === "draw" ? "Draw" : "Seed"}>
                <input
                  aria-label={key === "draw" ? "Draw" : "Seed"}
                  data-focus-ring="none"
                  className={inputClass}
                  value={draft[key]}
                  disabled={!!entry}
                  maxLength={key === "draw" ? 200 : 10}
                  inputMode={key === "seed" ? "numeric" : "text"}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Round" required>
              <select
                aria-label="Round"
                className={advField("boxed")}
                value={draft.round}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    round: e.target.value,
                    score: emptyScore(draft.tournament.bestOf),
                    outcome: "",
                  })
                }
              >
                {ROUND_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {r} · {roundLongLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {recorded ? (
            <p role="status" className="text-[13px] text-[var(--ink-600)]">
              {draft.playerLabel} · {draft.round} · {recorded} · Recorded result
              · Read-only
            </p>
          ) : (
            <>
              <p className="text-[12px] text-[var(--ink-600)]">
                Scores are {draft.playerLabel || "the selected player"} first.
              </p>
              <Field label="Result type" required>
                <select
                  aria-label="Result type"
                  className={advField("boxed")}
                  value={draft.outcome || "score"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      outcome:
                        e.target.value === "score"
                          ? ""
                          : (e.target.value as TournamentDraft["outcome"]),
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
                          {side === "ours" ? "Our player" : "Opponent"} · {kind}
                        </option>
                      ),
                    ),
                  )}
                </select>
              </Field>
              {!draft.outcome && (
                <>
                  <Field label="Opponent" required>
                    <input
                      aria-label="Opponent"
                      data-focus-ring="none"
                      className={inputClass}
                      maxLength={200}
                      value={draft.score.opponentName}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          score: {
                            ...draft.score,
                            opponentName: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    {draft.score.playerScores.map((_, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-[11px] text-[var(--ink-600)]">
                          Set {i + 1}
                        </span>
                        <div className="flex gap-1">
                          {(["playerScores", "opponentScores"] as const).map(
                            (field) => (
                              <input
                                key={field}
                                type="number"
                                min={0}
                                max={99}
                                aria-label={`Set ${i + 1} ${field === "playerScores" ? "player" : "opponent"} games`}
                                className={`${advField("boxed")} w-10 px-1 text-center tabular-nums`}
                                value={draft.score[field][i] ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    score: {
                                      ...draft.score,
                                      [field]: draft.score[field].map((n, j) =>
                                        j === i
                                          ? e.target.value === ""
                                            ? null
                                            : Number(e.target.value)
                                          : n,
                                      ),
                                    },
                                  })
                                }
                              />
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-[12px] text-[var(--ink-600)]">
                      Tiebreaks and match ending
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {draft.score.playerScores.map((_, i) => (
                        <div key={i} className="flex gap-1">
                          {(
                            ["playerTiebreaks", "opponentTiebreaks"] as const
                          ).map((field) => (
                            <input
                              key={field}
                              type="number"
                              min={0}
                              max={999}
                              aria-label={`Set ${i + 1} ${field === "playerTiebreaks" ? "player" : "opponent"} tiebreak points`}
                              className={`${advField("boxed")} w-16`}
                              value={draft.score[field][i] ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  score: {
                                    ...draft.score,
                                    [field]: draft.score[field].map((n, j) =>
                                      j === i
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
                      <select
                        aria-label="Match ending"
                        className={advField("boxed")}
                        value={draft.score.ending ?? "played"}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            score: {
                              ...draft.score,
                              ending:
                                e.target.value === "played"
                                  ? null
                                  : (e.target.value as "retired" | "defaulted"),
                              stoppedBy: null,
                            },
                          })
                        }
                      >
                        <option value="played">Played out</option>
                        <option value="retired">Retired</option>
                        <option value="defaulted">Defaulted</option>
                      </select>
                      {draft.score.ending && (
                        <select
                          aria-label="Stopped by"
                          className={advField("boxed")}
                          value={draft.score.stoppedBy ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              score: {
                                ...draft.score,
                                stoppedBy: e.target.value as "ours" | "theirs",
                              },
                            })
                          }
                        >
                          <option value="">Choose who stopped</option>
                          <option value="ours">Our player</option>
                          <option value="theirs">Opponent</option>
                        </select>
                      )}
                    </div>
                  </details>
                </>
              )}
            </>
          )}
          {!recorded &&
            checked.errors.map((message) => (
              <p
                key={message}
                role="alert"
                className="text-[12px] text-[var(--danger)]"
              >
                {message}
              </p>
            ))}
          <div className="flex justify-end">
            <button
              className={advButton("primary", "md")}
              disabled={!ready || !checked.valid || pending}
              onClick={() =>
                setRequest(
                  freezeTournamentRequest(
                    context.workspace.id,
                    draft,
                    existing,
                    () => crypto.randomUUID(),
                  ),
                )
              }
            >
              Review result
            </button>
          </div>
        </>
      )}
    </div>
  );
}
