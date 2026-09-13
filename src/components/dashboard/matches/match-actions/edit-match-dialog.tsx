"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CircleMinus, CirclePlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  eyebrowLabelCls,
  ghostBtnCls,
  primaryBtnCls,
} from "@/components/dashboard/home/upload-match-modal/styles";
import { validateSetScore } from "@/components/dashboard/home/upload-match-modal/utils";
import { ScoreCell } from "@/components/dashboard/home/upload-match-modal/ScoreCell";

type FieldKey = "player1_name" | "player2_name" | "date";

interface EditMatchDialogProps {
  matchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RawMatch {
  id: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  match_type: string | null;
  court_type: string | null;
  player1_name: string;
  player2_name: string;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  } | null;
}

const MATCH_TYPES = ["Tournament", "Dual Match", "Practice"];
const COURT_TYPES = ["hard", "clay", "grass", "carpet"];
const MIN_SETS = 1;
const MAX_SETS = 5;

function needsTiebreak(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  return (p === 7 && o === 6) || (p === 6 && o === 7);
}

function toDateInputValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function clampInt(raw: string, max: number): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export function EditMatchDialog({ matchId, open, onOpenChange }: EditMatchDialogProps) {
  const router = useRouter();
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pendingRemoveAt, setPendingRemoveAt] = useState<number | null>(null);

  const [tournament, setTournament] = useState("");
  const [date, setDate] = useState("");
  const [round, setRound] = useState("");
  const [matchType, setMatchType] = useState<string>("");
  const [courtType, setCourtType] = useState<string>("");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p1Scores, setP1Scores] = useState<(number | null)[]>([]);
  const [p2Scores, setP2Scores] = useState<(number | null)[]>([]);
  const [p1Tiebreaks, setP1Tiebreaks] = useState<(number | null)[]>([]);
  const [p2Tiebreaks, setP2Tiebreaks] = useState<(number | null)[]>([]);

  const p1NameRef = useRef<HTMLInputElement>(null);
  const p2NameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const p1ScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const p2ScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const p1TiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const p2TiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Enter-to-advance flow:
  //   p1.set[i] → p2.set[i] → (if tiebreak) p1.tb[i] → p2.tb[i] → p1.set[i+1] …
  //   On the last set's final cell, escape to the Save button.
  const focusNextAfterScore = (side: "p1" | "p2", i: number) => {
    if (side === "p1") {
      p2ScoreRefs.current[i]?.focus();
      return;
    }
    // side === "p2": after both players' set scores, check for tiebreak
    if (needsTiebreak(p1Scores[i], p2Scores[i])) {
      p1TiebreakRefs.current[i]?.focus();
      return;
    }
    advanceToNextSetOrSave(i);
  };

  const focusNextAfterTiebreak = (side: "p1" | "p2", i: number) => {
    if (side === "p1") {
      p2TiebreakRefs.current[i]?.focus();
      return;
    }
    advanceToNextSetOrSave(i);
  };

  const advanceToNextSetOrSave = (i: number) => {
    const next = p1ScoreRefs.current[i + 1];
    if (next) next.focus();
    else saveRef.current?.focus();
  };

  const focusPrevFromScore = (side: "p1" | "p2", i: number) => {
    if (side === "p2") {
      p1ScoreRefs.current[i]?.focus();
      return;
    }
    // side === "p1": jump back to previous set's last filled cell
    if (i === 0) {
      p1NameRef.current?.focus();
      return;
    }
    const prev = i - 1;
    if (needsTiebreak(p1Scores[prev], p2Scores[prev])) {
      p2TiebreakRefs.current[prev]?.focus();
    } else {
      p2ScoreRefs.current[prev]?.focus();
    }
  };

  const focusPrevFromTiebreak = (side: "p1" | "p2", i: number) => {
    if (side === "p2") {
      p1TiebreakRefs.current[i]?.focus();
    } else {
      p2ScoreRefs.current[i]?.focus();
    }
  };
  const fieldRefs: Record<FieldKey, React.RefObject<HTMLInputElement | null>> = {
    player1_name: p1NameRef,
    player2_name: p2NameRef,
    date: dateRef,
  };

  // Per-set validation against tennis rules. The dialog shares the upload
  // modal's validateSetScore so create/edit treat the same scores as legal.
  const setValidations = p1Scores.map((p, i) => validateSetScore(p, p2Scores[i]));
  const firstInvalid = setValidations.findIndex((v) => v.kind === "invalid");
  const invalidMessage = firstInvalid >= 0 ? setValidations[firstInvalid].message : null;
  const hasInvalidSet = firstInvalid >= 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingInitial(true);
    setLoadError(null);
    setError(null);
    setFieldErrors({});
    setPendingRemoveAt(null);
    fetch(`/api/matches/${matchId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to load match");
        }
        return res.json();
      })
      .then(({ match }: { match: RawMatch }) => {
        if (cancelled) return;
        setTournament(match.tournament_name ?? "");
        setDate(toDateInputValue(match.date));
        setRound(match.round ?? "");
        setMatchType(match.match_type ?? "");
        setCourtType(match.court_type ?? "");
        setP1Name(match.player1_name);
        setP2Name(match.player2_name);

        const s = match.score;
        const setCount = s?.player1?.length || 1;
        setP1Scores(s?.player1?.slice(0, setCount) ?? Array(setCount).fill(null));
        setP2Scores(s?.player2?.slice(0, setCount) ?? Array(setCount).fill(null));
        setP1Tiebreaks(
          (s?.player1_tiebreaks ?? Array(setCount).fill(null)).map((v) => v ?? null)
        );
        setP2Tiebreaks(
          (s?.player2_tiebreaks ?? Array(setCount).fill(null)).map((v) => v ?? null)
        );
        setLoadingInitial(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load match");
        setLoadingInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, open]);

  const numSets = p1Scores.length;

  // Clear both sides' tiebreak slots when set [i] no longer needs a tiebreak.
  // Keeps stale 7-6 tiebreak numbers from persisting after the set is amended.
  const clearTiebreaksAt = (i: number) => {
    if (p1Tiebreaks[i] !== null) {
      const t = [...p1Tiebreaks];
      t[i] = null;
      setP1Tiebreaks(t);
    }
    if (p2Tiebreaks[i] !== null) {
      const t = [...p2Tiebreaks];
      t[i] = null;
      setP2Tiebreaks(t);
    }
  };

  const lastSetHasData = (() => {
    const i = numSets - 1;
    if (i < 0) return false;
    return (
      p1Scores[i] !== null ||
      p2Scores[i] !== null ||
      p1Tiebreaks[i] !== null ||
      p2Tiebreaks[i] !== null
    );
  })();

  const addSet = () => {
    if (numSets >= MAX_SETS) return;
    setPendingRemoveAt(null);
    setP1Scores([...p1Scores, null]);
    setP2Scores([...p2Scores, null]);
    setP1Tiebreaks([...p1Tiebreaks, null]);
    setP2Tiebreaks([...p2Tiebreaks, null]);
  };

  const requestRemoveLastSet = () => {
    if (numSets <= MIN_SETS) return;
    const idx = numSets - 1;
    // Empty last set removes immediately — no need to confirm a no-op.
    if (!lastSetHasData) {
      doRemoveLastSet(idx);
      return;
    }
    setPendingRemoveAt(idx);
  };

  const doRemoveLastSet = (idx: number) => {
    const next = idx;
    setP1Scores(p1Scores.slice(0, next));
    setP2Scores(p2Scores.slice(0, next));
    setP1Tiebreaks(p1Tiebreaks.slice(0, next));
    setP2Tiebreaks(p2Tiebreaks.slice(0, next));
    setPendingRemoveAt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || hasInvalidSet) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      tournament_name: tournament,
      date,
      round,
      match_type: matchType || null,
      court_type: courtType || null,
      player1_name: p1Name,
      player2_name: p2Name,
      score: {
        player1: p1Scores.map((s) => s ?? 0),
        player2: p2Scores.map((s) => s ?? 0),
        player1_tiebreaks: p1Tiebreaks,
        player2_tiebreaks: p2Tiebreaks,
      },
    };

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body: { error?: string; field?: string } = await res
          .json()
          .catch(() => ({}));
        const message = body?.error ?? "Failed to save match";
        const field = body?.field as FieldKey | undefined;
        if (field && field in fieldRefs) {
          setFieldErrors({ [field]: message });
          const target = fieldRefs[field]?.current;
          target?.scrollIntoView({ block: "center", behavior: "smooth" });
          target?.focus({ preventScroll: true });
        } else {
          setError(message);
        }
        setSaving(false);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-xl rounded-2xl border-[#F3F3F3] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)] bg-white p-0 gap-0 overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-8 pt-5 pb-6">
          <DialogTitle className="text-left text-[24px] font-light text-[#1D1D1F] tracking-[-0.5px] leading-[30px]">
            Edit match
          </DialogTitle>
          <DialogDescription className="sr-only">
            Update the match details and save.
          </DialogDescription>
        </DialogHeader>

        {loadingInitial ? (
          <div className="px-8 py-12 flex items-center justify-center text-[#888888]">
            <Loader2 className="size-3.5 animate-spin mr-2" aria-hidden="true" />
            <span className="text-[12px]">Loading match…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col">
            <div className="px-8 py-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[13px] font-medium text-[#0D0D0D]">
                We couldn&apos;t load this match
              </p>
              <p className="text-[12px] text-[#888888] max-w-[320px] leading-[1.5]">
                {loadError}. The match may have been removed, or your connection
                dropped. Close this dialog and try again from the match list.
              </p>
            </div>
            <div className="border-t border-[#F3F3F3] bg-[#FAFAFA] px-8 py-3.5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={primaryBtnCls}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!(e.metaKey || e.ctrlKey)) return;
              if (saving || hasInvalidSet) return;
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }}
            className="flex flex-col"
          >
            <div className="flex flex-col gap-6 overflow-y-auto px-8 pb-6 max-h-[60vh]">
              {/* Tournament — anchors the form as the primary input. Larger
                  type pulls the eye here first; everything else is grouped
                  below under hairline-divided sections. */}
              <UnderlineField label="Tournament">
                <input
                  value={tournament}
                  onChange={(e) => setTournament(e.target.value)}
                  className="w-full bg-transparent text-[18px] font-medium tracking-[-0.3px] text-[#0D0D0D] outline-none placeholder:text-[#AAAAAA] placeholder:font-normal pb-1.5"
                />
              </UnderlineField>

              {/* Score block — editorial scoreboard */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className={eyebrowLabelCls}>Score</h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={requestRemoveLastSet}
                      disabled={numSets <= MIN_SETS}
                      aria-label="Remove a set"
                      className="size-7 flex items-center justify-center rounded-full text-[#3B82F6] hover:text-[#2563EB] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                    >
                      <CircleMinus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <span className="w-4 text-center text-[12px] font-medium text-[#525252] tabular-nums">
                      {numSets}
                    </span>
                    <button
                      type="button"
                      onClick={addSet}
                      disabled={numSets >= MAX_SETS}
                      aria-label="Add a set"
                      className="size-7 flex items-center justify-center rounded-full text-[#3B82F6] hover:text-[#2563EB] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                    >
                      <CirclePlus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {pendingRemoveAt !== null && (
                  <div className="flex items-center justify-end gap-2 text-[11px] text-[#525252]">
                    <span>
                      Remove set {pendingRemoveAt + 1}? Scores will be cleared.
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveAt(null)}
                      className="px-2 py-0.5 rounded-full text-[#525252] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => doRemoveLastSet(pendingRemoveAt)}
                      className="px-2 py-0.5 rounded-full text-[#E51837] hover:bg-[rgba(229,24,55,0.08)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E51837]/40"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Scoreboard frame */}
                <div className="flex flex-col border-t border-[#F3F3F3] pt-4">
                  {/* Set column headers */}
                  <div className="flex justify-end pb-2">
                    <div className="flex gap-4">
                      {p1Scores.map((_, i) => {
                        const hasTie = needsTiebreak(p1Scores[i], p2Scores[i]);
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <div className="w-7 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] tabular-nums">
                              {i + 1}
                            </div>
                            {hasTie && (
                              <span className="w-7 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
                                Tie
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    {/* Player 1 row */}
                    <PlayerRow
                      side="p1"
                      placeholder="Your name"
                      value={p1Name}
                      inputRef={p1NameRef}
                      error={fieldErrors.player1_name ?? null}
                      invalidSetIdx={firstInvalid >= 0 ? firstInvalid : undefined}
                      scoreRefs={p1ScoreRefs}
                      tiebreakRefs={p1TiebreakRefs}
                      onEnterScoreValue={focusNextAfterScore}
                      onEnterScoreEmpty={focusPrevFromScore}
                      onEnterTiebreakValue={focusNextAfterTiebreak}
                      onEnterTiebreakEmpty={focusPrevFromTiebreak}
                      onChange={(v) => {
                        setP1Name(v);
                        if (fieldErrors.player1_name) {
                          const next = { ...fieldErrors };
                          delete next.player1_name;
                          setFieldErrors(next);
                        }
                      }}
                      scores={p1Scores}
                      tiebreaks={p1Tiebreaks}
                      opponentScores={p2Scores}
                      onScoreChange={(i, v) => {
                        const nextScore = clampInt(v, 99);
                        const nextP1 = [...p1Scores];
                        nextP1[i] = nextScore;
                        setP1Scores(nextP1);
                        if (!needsTiebreak(nextScore, p2Scores[i])) clearTiebreaksAt(i);
                      }}
                      onTiebreakChange={(i, v) => {
                        const next = [...p1Tiebreaks];
                        next[i] = clampInt(v, 999);
                        setP1Tiebreaks(next);
                      }}
                    />

                    {/* Player 2 row */}
                    <PlayerRow
                      side="p2"
                      placeholder="Opponent name"
                      value={p2Name}
                      inputRef={p2NameRef}
                      error={fieldErrors.player2_name ?? null}
                      invalidSetIdx={firstInvalid >= 0 ? firstInvalid : undefined}
                      scoreRefs={p2ScoreRefs}
                      tiebreakRefs={p2TiebreakRefs}
                      onEnterScoreValue={focusNextAfterScore}
                      onEnterScoreEmpty={focusPrevFromScore}
                      onEnterTiebreakValue={focusNextAfterTiebreak}
                      onEnterTiebreakEmpty={focusPrevFromTiebreak}
                      onChange={(v) => {
                        setP2Name(v);
                        if (fieldErrors.player2_name) {
                          const next = { ...fieldErrors };
                          delete next.player2_name;
                          setFieldErrors(next);
                        }
                      }}
                      scores={p2Scores}
                      tiebreaks={p2Tiebreaks}
                      opponentScores={p1Scores}
                      onScoreChange={(i, v) => {
                        const nextScore = clampInt(v, 99);
                        const nextP2 = [...p2Scores];
                        nextP2[i] = nextScore;
                        setP2Scores(nextP2);
                        if (!needsTiebreak(p1Scores[i], nextScore)) clearTiebreaksAt(i);
                      }}
                      onTiebreakChange={(i, v) => {
                        const next = [...p2Tiebreaks];
                        next[i] = clampInt(v, 999);
                        setP2Tiebreaks(next);
                      }}
                    />
                  </div>

                  {invalidMessage && (
                    <div className="flex justify-start mt-3">
                      <div className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.18)] rounded-full">
                        <AlertCircle className="size-3 text-[#E51837]" strokeWidth={1.75} aria-hidden="true" />
                        <span className="text-[#E51837] text-[12px] font-medium">
                          Set {firstInvalid + 1}: {invalidMessage}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata grid — the hairline border above does the section
                  break; no eyebrow needed (each field is self-labeled). */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 pt-6 border-t border-[#F3F3F3]">
                <UnderlineField label="Date" error={fieldErrors.date ?? null}>
                  <input
                    ref={dateRef}
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (fieldErrors.date) {
                        const next = { ...fieldErrors };
                        delete next.date;
                        setFieldErrors(next);
                      }
                    }}
                    required
                    aria-invalid={fieldErrors.date ? true : undefined}
                    className="w-full appearance-none bg-transparent text-[14px] outline-none text-[#0D0D0D] pb-1.5"
                  />
                </UnderlineField>
                <UnderlineField label="Round">
                  <input
                    value={round}
                    onChange={(e) => setRound(e.target.value)}
                    className="w-full bg-transparent text-[14px] outline-none text-[#0D0D0D] placeholder:text-[#AAAAAA] pb-1.5"
                  />
                </UnderlineField>
                <UnderlineField label="Match type">
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value)}
                    className={cn(
                      "w-full appearance-none bg-transparent text-[14px] outline-none pb-1.5 cursor-pointer",
                      matchType ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
                    )}
                  >
                    <option value="">Select type</option>
                    {MATCH_TYPES.map((t) => (
                      <option key={t} value={t} className="text-[#0D0D0D]">
                        {t}
                      </option>
                    ))}
                  </select>
                </UnderlineField>
                <UnderlineField label="Court surface">
                  <select
                    value={courtType}
                    onChange={(e) => setCourtType(e.target.value)}
                    className={cn(
                      "w-full appearance-none bg-transparent text-[14px] outline-none pb-1.5 cursor-pointer capitalize",
                      courtType ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
                    )}
                  >
                    <option value="">Select surface</option>
                    {COURT_TYPES.map((t) => (
                      <option key={t} value={t} className="text-[#0D0D0D] capitalize">
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </UnderlineField>
              </div>

            </div>

            {/* Server-error banner — docked above the footer so a 500 / network
                failure stays visible even when the body has scrolled. */}
            {error && (
              <div className="border-t border-[rgba(229,24,55,0.18)] bg-[rgba(229,24,55,0.06)] px-8 py-3">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="size-3 text-[#E51837] mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-[12px] font-medium text-[#E51837] leading-[1.5]">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-[#F3F3F3] bg-[#FAFAFA] px-8 py-3.5 flex items-center justify-between gap-2">
              <SaveShortcutHint disabled={saving || hasInvalidSet} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  className={ghostBtnCls}
                >
                  Cancel
                </button>
                <button
                  ref={saveRef}
                  type="submit"
                  disabled={saving || hasInvalidSet}
                  title={hasInvalidSet ? "Fix the invalid set score to save" : undefined}
                  className={cn(primaryBtnCls, "min-w-[84px]")}
                >
                  {saving ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Saving…
                    </span>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaveShortcutHint({ disabled }: { disabled: boolean }) {
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    type WithUaData = Navigator & {
      userAgentData?: { platform?: string };
    };
    const nav = navigator as WithUaData;
    const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
    setIsMac(/Mac/i.test(platform));
  }, []);

  // First paint avoids SSR mismatch by rendering nothing until platform settles.
  if (isMac === null) return <span aria-hidden="true" />;

  const kbdCls =
    "inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]",
        disabled && "opacity-50"
      )}
    >
      {isMac ? (
        <kbd className={kbdCls}>⌘↵</kbd>
      ) : (
        <>
          <kbd className={kbdCls}>Ctrl</kbd>
          <span className="text-[#CCCCCC]">+</span>
          <kbd className={kbdCls}>↵</kbd>
        </>
      )}
      <span>Save</span>
    </span>
  );
}

function UnderlineField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={eyebrowLabelCls}>{label}</label>
      <div className="group flex flex-col">
        {children}
        <div
          className={
            error
              ? "h-[1px] w-full bg-[#E51837]"
              : "h-[1px] w-full bg-[#F3F3F3] motion-safe:transition-all motion-safe:duration-300 group-focus-within:h-[2px] group-focus-within:bg-[#3B82F6]"
          }
        />
        {error && (
          <span className="text-[11px] text-[#E51837] leading-none mt-1">{error}</span>
        )}
      </div>
    </div>
  );
}

type Side = "p1" | "p2";

interface PlayerRowProps {
  placeholder: string;
  value: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  error?: string | null;
  invalidSetIdx?: number;
  onChange: (v: string) => void;
  scores: (number | null)[];
  tiebreaks: (number | null)[];
  opponentScores: (number | null)[];
  scoreRefs: React.RefObject<Record<number, HTMLInputElement | null>>;
  tiebreakRefs: React.RefObject<Record<number, HTMLInputElement | null>>;
  side: Side;
  onScoreChange: (i: number, v: string) => void;
  onTiebreakChange: (i: number, v: string) => void;
  onEnterScoreValue: (side: Side, i: number, raw: string) => void;
  onEnterScoreEmpty: (side: Side, i: number) => void;
  onEnterTiebreakValue: (side: Side, i: number) => void;
  onEnterTiebreakEmpty: (side: Side, i: number) => void;
}

function PlayerRow({
  placeholder,
  value,
  inputRef,
  error,
  invalidSetIdx,
  onChange,
  scores,
  tiebreaks,
  opponentScores,
  scoreRefs,
  tiebreakRefs,
  side,
  onScoreChange,
  onTiebreakChange,
  onEnterScoreValue,
  onEnterScoreEmpty,
  onEnterTiebreakValue,
  onEnterTiebreakEmpty,
}: PlayerRowProps) {
  return (
    <div className="flex justify-between items-start gap-4">
      <div className="group/name flex flex-col flex-1 min-w-0 max-w-[320px]">
        <input
          ref={inputRef}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none placeholder:text-[#AAAAAA] placeholder:font-normal pb-1.5"
        />
        <div
          className={
            error
              ? "h-[1px] w-full bg-[#E51837]"
              : "h-[1px] w-full bg-[#F3F3F3] motion-safe:transition-all motion-safe:duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]"
          }
        />
        {error && (
          <span className="text-[11px] text-[#E51837] leading-none mt-1">{error}</span>
        )}
      </div>
      <div className="flex gap-4 pt-1">
        {scores.map((score, i) => {
          const hasTie = needsTiebreak(scores[i], opponentScores[i]);
          const isInvalid = invalidSetIdx === i;
          return (
            <div key={i} className="flex items-center gap-1">
              <ScoreCell
                refMap={scoreRefs}
                i={i}
                value={score}
                maxLength={2}
                invalid={isInvalid}
                onValueChange={(v) => onScoreChange(i, v)}
                onEnterValue={(raw) => onEnterScoreValue(side, i, raw)}
                onEnterEmpty={() => onEnterScoreEmpty(side, i)}
              />
              {hasTie && (
                <ScoreCell
                  refMap={tiebreakRefs}
                  i={i}
                  value={tiebreaks[i] ?? null}
                  maxLength={3}
                  onValueChange={(v) => onTiebreakChange(i, v)}
                  onEnterValue={() => onEnterTiebreakValue(side, i)}
                  onEnterEmpty={() => onEnterTiebreakEmpty(side, i)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

