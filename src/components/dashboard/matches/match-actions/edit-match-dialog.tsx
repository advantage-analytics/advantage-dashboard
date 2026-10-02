"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Info, Loader2, RefreshCw } from "lucide-react";
import { DateField, type DateFieldHandle } from "@/components/ui/date-field";
import { MenuSelect } from "@/components/ui/menu-select";
import { advButton } from "@/lib/ui/adv-button";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import { ConfirmDialog, Em } from "@/components/ui/confirm-dialog";
import {
  Answer,
  WarningGlyph,
} from "@/components/dashboard/matches/new-match-wizard/ImportIdentityNotice";
import {
  noteIconCls,
  noteStripCls,
  noticeEnterCls,
  warningStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { useToast } from "@/components/dashboard/toast/toast-provider";
import { forgetMatchDetails } from "@/components/dashboard/matches/match-drawer";
import type { AnalysisStatus } from "@/lib/data/match-analysis";
import {
  BACKHANDS,
  HANDS,
  scoreForSave,
  type Backhand,
  type Hand,
  type MatchFormat,
  type MatchScore,
} from "@/lib/matches/patch-match";
import {
  dayLabel,
  droppedDetailsLine,
  eventContextLine,
  formatLine,
  formatPhrase,
  surname,
} from "@/lib/matches/edit-match-copy";
import {
  attachMatchToLine,
  detachMatchFromLine,
  setMatchRoundOnLine,
  findAttachableLines,
} from "@/lib/schedule/attach-line";
import { lineName, type AttachLine } from "@/lib/schedule/attach-line-state";
import { AttachLinePicker } from "./attach-line-picker";
import {
  EventField,
  eventFieldValue,
  EventRoundField,
  LinkedEventLine,
} from "./edit-match-event";
import { EditMatchPending } from "@/components/dashboard/loading/edit-match-pending";
import {
  EditMatchScore,
  firstInvalidSet,
  type ScoreValue,
} from "./edit-match-score";
import { EditMatchPlayers, type PlayerFields } from "./edit-match-players";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { workspaceLabel } from "@/components/dashboard/matches/new-match-wizard/RosterMenu";
import {
  editMatchSuggestions,
  playerStyleFor,
  type EditRosterPlayer,
  type KnownStyle,
} from "@/lib/matches/edit-match-suggestions";
import {
  normalizeRound,
  roundFits,
  roundKindFor,
  roundOptionsFor,
} from "@/lib/matches/round-options";
import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";

type FieldKey = "player1_name" | "player2_name" | "date" | "round";

interface RawMatch {
  id: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  match_type: string | null;
  court_type: string | null;
  player1_id: string | null;
  player1_name: string;
  player2_name: string;
  score: MatchScore | null;
  format: MatchFormat | null;
  duration: number | null;
  player_hand: string | null;
  player_backhand: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  program_id: string | null;
  event_entry_id: string | null;
  source_provider: string | null;
}

interface EventContext {
  eventId: string;
  eventName: string;
  eventKind: "dual" | "tournament";
  slot: string | null;
  startsOn: string;
  endsOn: string;
  surface: string | null;
  format: { best_of?: number; ad_scoring?: boolean | null } | null;
  /** Rounds the line holds without this match, as codes. */
  takenRounds: string[];
}

interface Loaded {
  match: RawMatch;
  analysis: { status: AnalysisStatus } | null;
  event: EventContext | null;
  canAttach: boolean;
  /** On a line, and the viewer may take it off (`detach_match_from_event_line`). */
  canDetach: boolean;
  /**
   * On a tournament line, and the viewer may change its round
   * (`set_match_round_on_line`). Never for a dual: its round is its slot.
   */
  canEditRound: boolean;
  /**
   * The analysis a new score can be rebuilt against, and the bookmarks that
   * rebuild would remove — null when there is nothing to rebuild.
   */
  rebuild: { jobId: string; bookmarks: number } | null;
}

/** Sets and tiebreaks only: `winner` follows from them. */
function sameScore(a: MatchScore | null, b: MatchScore | null): boolean {
  const key = (s: MatchScore | null) =>
    JSON.stringify([
      s?.player1 ?? [],
      s?.player2 ?? [],
      s?.player1_tiebreaks ?? [],
      s?.player2_tiebreaks ?? [],
    ]);
  return key(a) === key(b);
}

const FORM_ID = "edit-match-form";
const NOT_SET = "__not-set";
const MATCH_TYPE_OPTIONS = ["Tournament", "Dual Match", "Practice"].map(
  (t) => ({ value: t, label: t }),
);
const COURT_TYPE_OPTIONS = ["hard", "clay", "grass", "carpet"].map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

/**
 * A menu's options with a stored value that is in none of them kept as its
 * own first row, and "Not set" last — so opening the menu never wipes it.
 */
function withLegacy(
  value: string,
  options: readonly { value: string; label: string }[],
) {
  const legacy =
    value !== "" && !options.some((o) => o.value === value)
      ? [{ value, label: value }]
      : [];
  return [...legacy, ...options, { value: NOT_SET, label: "Not set" }];
}
const BEST_OF = [
  { value: "1", label: "Best of 1" },
  { value: "3", label: "Best of 3" },
  { value: "5", label: "Best of 5" },
] as const;
const SCORING = [
  { value: "no-ad", label: "No-ad" },
  { value: "ad", label: "Ad" },
] as const;
const LETS = [
  { value: "play-on", label: "Play on" },
  { value: "replay", label: "Replay" },
] as const;

const asHand = (v: string | null): Hand | null =>
  HANDS.find((h) => h === v) ?? null;
const asBackhand = (v: string | null): Backhand | null =>
  BACKHANDS.find((b) => b === v) ?? null;

/** The calendar day a stored match date means — its own date part. */
function dayOf(iso: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1] ?? "";
}

/**
 * Edit match — the P2 refined layout, with E1 for a match on the schedule and
 * the "Add to an event" flow for a one-off team match (canvas: Edit Match
 * Dialog › P2 refined, Event directions › E1, Add to an event 1–10).
 *
 * Top to bottom: the score (the upload wizard's cells), Players (name, hand,
 * backhand), then Details — or, once the match is on a line, nothing but a
 * closing line, because the event owns its date, round, type and surface and
 * says so in the header instead of in four locked fields. Groups separate by
 * space (40px), never by rules.
 *
 * Adding to an event is chosen here and committed by Save changes: the edit
 * saves first, then `attach_match_to_event_line` runs. While a line is picked
 * but unsaved, the header already reads as it will after Save, with Change in
 * the slot Open takes afterwards, and the footer's left corner backs out.
 */
export function EditMatchDialog({
  matchId,
  open,
  onOpenChange,
}: {
  matchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});

  const [tournament, setTournament] = useState("");
  const [date, setDate] = useState("");
  const [dateIncomplete, setDateIncomplete] = useState(false);
  const [round, setRound] = useState("");
  const [matchType, setMatchType] = useState("");
  const [courtType, setCourtType] = useState("");
  const [player, setPlayer] = useState<PlayerFields>({
    name: "",
    hand: null,
    backhand: null,
  });
  const [opponent, setOpponent] = useState<PlayerFields>({
    name: "",
    hand: null,
    backhand: null,
  });
  const [score, setScore] = useState<ScoreValue>({
    player: [],
    opponent: [],
    playerTiebreaks: [],
    opponentTiebreaks: [],
  });
  const [format, setFormat] = useState<{
    bestOf: number;
    adScoring: boolean | null;
    playOnLets: boolean | null;
  }>({ bestOf: 3, adScoring: null, playOnLets: null });

  const workspace = useWorkspace();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roster, setRoster] = useState<EditRosterPlayer[] | null>(null);
  /** Hands the dialog filled in, so the note can say where they came from. */
  const [playerPrefill, setPlayerPrefill] = useState<KnownStyle | null>(null);
  const [opponentPrefill, setOpponentPrefill] = useState<KnownStyle | null>(
    null,
  );

  /** A line chosen but not saved (Add to an event, states 5–7). */
  const [pendingLine, setPendingLine] = useState<AttachLine | null>(null);
  const [picking, setPicking] = useState(false);
  /** The pick to restore if Change is abandoned. */
  const changeFrom = useRef<AttachLine | null>(null);

  /** "Remove from event": the confirm, its request, and the reload after. */
  const [removing, setRemoving] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * The score was saved but the rebuild the viewer asked for failed; the
   * footer becomes Close / Try again, and the error says what was kept.
   */
  const [rebuildFailed, setRebuildFailed] = useState(false);

  const p1Ref = useRef<HTMLInputElement>(null);
  const p2Ref = useRef<HTMLInputElement>(null);
  const dateRef = useRef<DateFieldHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoaded(null);
    setLoadError(null);
    setError(null);
    setFieldErrors({});
    setPendingLine(null);
    setPicking(false);
    setRebuildFailed(false);
    Promise.all([
      fetch(`/api/matches/${matchId}`).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Couldn't load the match.");
        return body as Loaded;
      }),
      editMatchSuggestions({ matchId }).catch(() => null),
    ])
      .then(([data, suggestions]) => {
        if (!live) return;
        const m = data.match;
        setPlayerId(m.player1_id);
        setRoster(m.program_id ? (suggestions?.roster ?? []) : null);
        setTournament(eventFieldValue(m));
        setDate(dayOf(m.date));
        setRound(normalizeRound(m.round) ?? "");
        setMatchType(m.match_type ?? "");
        setCourtType(m.court_type ?? "");
        // Known hands fill only what the match left empty; a value already on
        // the match is the record and is never replaced.
        const withKnown = (
          hand: Hand | null,
          backhand: Backhand | null,
          known: KnownStyle | null | undefined,
        ) => {
          const next = {
            hand: hand ?? known?.hand ?? null,
            backhand: backhand ?? known?.backhand ?? null,
          };
          const used =
            !!known &&
            ((hand === null && known.hand !== null) ||
              (backhand === null && known.backhand !== null));
          return { next, used };
        };
        const p = withKnown(
          asHand(m.player_hand),
          asBackhand(m.player_backhand),
          suggestions?.playerStyle,
        );
        const o = withKnown(
          asHand(m.opponent_hand),
          asBackhand(m.opponent_backhand),
          suggestions?.opponentStyle,
        );
        setPlayer({ name: m.player1_name, ...p.next });
        setOpponent({ name: m.player2_name, ...o.next });
        setPlayerPrefill(
          p.used ? { ...suggestions!.playerStyle!, ...p.next } : null,
        );
        setOpponentPrefill(
          o.used ? { ...suggestions!.opponentStyle!, ...o.next } : null,
        );
        const p1 = m.score?.player1 ?? [];
        const sets = Math.max(p1.length, 1);
        const pad = (arr: readonly (number | null)[] | undefined) =>
          Array.from({ length: sets }, (_, i) => arr?.[i] ?? null);
        setScore({
          player: pad(m.score?.player1),
          opponent: pad(m.score?.player2),
          playerTiebreaks: pad(m.score?.player1_tiebreaks),
          opponentTiebreaks: pad(m.score?.player2_tiebreaks),
        });
        setFormat({
          bestOf: m.format?.best_of ?? 3,
          adScoring: m.format?.ad_scoring ?? null,
          playOnLets: m.format?.play_on_lets ?? null,
        });
        setLoaded(data);
      })
      .catch((err) => {
        if (live)
          setLoadError(
            err instanceof Error ? err.message : "Couldn't load the match.",
          );
      });
    return () => {
      live = false;
    };
  }, [matchId, open, reloadKey]);

  const match = loaded?.match ?? null;
  const event = loaded?.event ?? null;
  const linked = event !== null;
  const analyzed: "video" | "import" | null = loaded?.analysis
    ? "video"
    : match?.source_provider
      ? "import"
      : null;
  const formatEditable = !!match && !linked && !analyzed && !pendingLine;
  /**
   * The score in the cells differs from the stored one on a match whose
   * analysis can be rebuilt: the note shows, and Save splits in two. The
   * analysis is checked against the entered score (and names the players from
   * it when the camera can't), so a changed score is a reason to rebuild — on
   * request, since a rebuild re-creates every point and bookmarks go with them.
   */
  const draftScore = match
    ? scoreForSave(score, (match.score?.player1?.length ?? 0) > 0)
    : null;
  const rebuildOffer =
    !!loaded?.rebuild &&
    !!draftScore?.ok &&
    !!draftScore.score &&
    !sameScore(draftScore.score as MatchScore, match?.score ?? null);
  const bookmarksLost = rebuildOffer ? (loaded?.rebuild?.bookmarks ?? 0) : 0;
  const roundKind = roundKindFor(matchType || null);
  const storedRound = normalizeRound(match?.round ?? null);
  /** A match already on a tournament line whose round this viewer may change. */
  const lineRoundEditable =
    linked && event?.eventKind === "tournament" && !!loaded?.canEditRound;
  /**
   * Details edited before a line was picked that Save won't send — the event
   * owns them — so the dialog says which are lost. A tournament keeps the
   * match's round and date, so those are sent and never listed.
   */
  const droppedDetails =
    match && pendingLine
      ? droppedDetailsLine(
          [
            tournament !== (match.tournament_name ?? "") && "event name",
            pendingLine.eventKind === "dual" &&
              date !== dayOf(match.date) &&
              "date",
            matchType !== (match.match_type ?? "") && "match type",
            pendingLine.eventKind === "dual" &&
              round !== (storedRound ?? "") &&
              "round",
            courtType !== (match.court_type ?? "") && "surface",
            (format.bestOf !== (match.format?.best_of ?? 3) ||
              format.adScoring !== (match.format?.ad_scoring ?? null) ||
              format.playOnLets !== (match.format?.play_on_lets ?? null)) &&
              "format",
          ].filter((word): word is string => !!word),
          pendingLine.eventKind,
        )
      : null;
  /** A stored round that is in neither list ("Week 4"), kept so it isn't wiped. */
  const legacyRound =
    storedRound &&
    !roundFits(storedRound, "tournament") &&
    !roundFits(storedRound, "dual")
      ? storedRound
      : null;
  /** The active workspace is this match's program — its name labels the roster. */
  const inMatchProgram =
    !!match?.program_id && workspace.active.id === match.program_id;
  const playerChanged =
    !!match && roster !== null && playerId !== match.player1_id;
  /** The roster pick Save will write, judged by the line picker before it lands. */
  const unsavedPlayer =
    playerChanged && playerId ? { id: playerId, name: player.name } : null;

  const styleNote = (
    fields: PlayerFields,
    prefill: KnownStyle | null,
  ): string | null => {
    if (!prefill) return null;
    if (fields.hand !== prefill.hand || fields.backhand !== prefill.backhand) {
      return null;
    }
    const words = [
      fields.hand === "right"
        ? "Right"
        : fields.hand === "left"
          ? "Left"
          : null,
      fields.backhand
        ? fields.hand
          ? fields.backhand
          : fields.backhand.charAt(0).toUpperCase() + fields.backhand.slice(1)
        : null,
    ].filter(Boolean);
    return words.length ? `${words.join(", ")} · ${prefill.source}` : null;
  };

  const latestPick = useRef<string | null>(null);

  async function pickRosterPlayer(next: EditRosterPlayer) {
    setPlayerId(next.playerId);
    // A picked line was judged against the previous player's lineup; pick it
    // again for this one rather than keep a stale verdict.
    if (next.playerId !== playerId) {
      setPendingLine(null);
      changeFrom.current = null;
    }
    clearFieldError("player1_name");
    // Hands the dialog filled in belonged to the previous player; typed ones stay.
    const cleared = playerPrefill
      ? {
          hand: player.hand === playerPrefill.hand ? null : player.hand,
          backhand:
            player.backhand === playerPrefill.backhand ? null : player.backhand,
        }
      : { hand: player.hand, backhand: player.backhand };
    setPlayer({ name: next.name, ...cleared });
    setPlayerPrefill(null);
    latestPick.current = next.playerId;
    const known = await playerStyleFor({
      matchId,
      playerId: next.playerId,
      playerName: next.name,
    }).catch(() => null);
    // A later pick, or nothing known, leaves the fields as they are.
    if (!known || latestPick.current !== next.playerId) return;
    const filled = {
      hand: cleared.hand ?? known.hand,
      backhand: cleared.backhand ?? known.backhand,
    };
    if (filled.hand === cleared.hand && filled.backhand === cleared.backhand) {
      return;
    }
    setPlayer((current) => ({
      ...current,
      hand: current.hand ?? known.hand,
      backhand: current.backhand ?? known.backhand,
    }));
    setPlayerPrefill({ ...known, ...filled });
  }
  // A doubles pro-set's games run to 9; the event wrote the length.
  const gamesTo = loaded?.match.format?.games_to ?? 6;
  const invalidSet = firstInvalidSet(score, gamesTo);
  const lineupBlocks = !!pendingLine?.lineupMismatch;

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const clearFieldError = (key: FieldKey) =>
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const focusField = (key: FieldKey) => {
    if (key === "date") dateRef.current?.focus();
    else if (key !== "round")
      (key === "player1_name" ? p1Ref : p2Ref).current?.focus();
  };

  function startChange() {
    changeFrom.current = pendingLine;
    setPendingLine(null);
    setPicking(true);
  }

  function pickLine(line: AttachLine) {
    changeFrom.current = null;
    clearFieldError("round");
    // A tournament line takes a ladder round; a dual's slot or a stored
    // "Week 4" would sit in its Round menu as a value it can't show.
    if (
      line.eventKind === "tournament" &&
      !roundFits(normalizeRound(round), "tournament")
    ) {
      setRound("");
    }
    setPendingLine(line);
    setPicking(false);
  }

  function closePicker() {
    setPicking(false);
    if (changeFrom.current) setPendingLine(changeFrom.current);
    changeFrom.current = null;
  }

  async function submit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    // "Save and rebuild" says so on its button; Enter and Cmd+Enter save only.
    const submitter = (e?.nativeEvent as SubmitEvent | undefined)?.submitter;
    const rebuild = submitter?.dataset.rebuild === "true";
    if (!match || saving || invalidSet || lineupBlocks) return;
    const detailsSent = !linked && !pendingLine;
    // A tournament keeps the match's own round, and its date when that falls
    // in the event (`attach_match_to_event_line`), so those still save.
    const tournamentLine = pendingLine?.eventKind === "tournament";
    // The attach refuses a tournament line without the match's round; ask here.
    if (tournamentLine && !round) {
      setFieldErrors({ round: "Choose the round." });
      return;
    }
    // On a tournament line already: the PATCH never carries the round (the
    // line owns it), so a changed one goes through `set_match_round_on_line`.
    if (lineRoundEditable && !round) {
      setFieldErrors({ round: "Choose the round." });
      return;
    }
    const lineRoundChanged = lineRoundEditable && round !== (storedRound ?? "");
    const dateSent = detailsSent || tournamentLine;
    if (dateSent && !date) {
      setFieldErrors({ date: "Enter the date." });
      focusField("date");
      return;
    }
    if (dateSent && dateIncomplete) {
      setFieldErrors({ date: "Finish the date." });
      focusField("date");
      return;
    }

    const saved = scoreForSave(score, (match.score?.player1?.length ?? 0) > 0);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const body: Record<string, unknown> = {
      player2_name: opponent.name,
      player_hand: player.hand,
      player_backhand: player.backhand,
      opponent_hand: opponent.hand,
      opponent_backhand: opponent.backhand,
    };
    if (saved.score) body.score = saved.score;
    // A personal match types its player; a team match picks from the roster,
    // and the server writes the name from that row. On a line, neither.
    if (roster === null) body.player1_name = player.name;
    else if (!linked && playerChanged && playerId) body.player1_id = playerId;
    // A line owns these once the match is on it — and is about to, when one is
    // picked. Sending them would only be overwritten or refused.
    if (detailsSent) {
      Object.assign(body, {
        tournament_name: tournament,
        date,
        round: roundKind ? round || null : null,
        match_type: matchType || null,
        court_type: courtType || null,
      });
    }
    if (tournamentLine) {
      Object.assign(body, {
        date,
        round: round || null,
        // The attach sets it too; sent so the round is judged as a tournament's.
        match_type: "Tournament",
      });
    }
    if (formatEditable) {
      body.format = {
        best_of: format.bestOf,
        ad_scoring: format.adScoring,
        play_on_lets: format.playOnLets,
      };
    }

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload: { error?: string; field?: string } = await res
          .json()
          .catch(() => ({}));
        const message = payload.error ?? "Couldn't save the match.";
        const field = payload.field as FieldKey | undefined;
        if (
          field === "player1_name" ||
          field === "player2_name" ||
          field === "date"
        ) {
          setFieldErrors({ [field]: message });
          focusField(field);
        } else {
          setError(message);
        }
        setSaving(false);
        return;
      }

      if (lineRoundChanged) {
        const moved = await setMatchRoundOnLine({ matchId, round });
        if (!moved.ok) {
          // The rest saved; the round didn't. The refusal is a sentence.
          setError(moved.error);
          setSaving(false);
          router.refresh();
          return;
        }
      }

      if (pendingLine) {
        const attached = await attachMatchToLine({
          matchId,
          entryId: pendingLine.entryId,
        });
        if (!attached.ok) {
          setError(
            `Your other changes were saved, but it wasn't added to the event: ${attached.error}`,
          );
          setSaving(false);
          router.refresh();
          return;
        }
        push({
          tone: "success",
          title: `Added to ${attached.eventName} · ${attached.slot ?? attached.round ?? ""}`,
          action: SCHEDULE_ENABLED
            ? {
                label: "Open in Schedule",
                href: `/dashboard/team/schedule/${attached.eventId}`,
              }
            : undefined,
        });
      }

      forgetMatchDetails(matchId);
      if (rebuild && rebuildOffer) {
        await rebuildStatistics();
        return;
      }
      setSaving(false);
      onOpenChange(false);
      router.refresh();
    } catch {
      setError(
        "Couldn't reach the server, so this may not have saved. Reload the page to check.",
      );
      setSaving(false);
    }
  }

  /**
   * Re-derive the match from the analysis already delivered, against the
   * score just saved. Runs with `saving` held, so the dialog can't be closed
   * half-way; a failure keeps the dialog open on Close / Try again.
   */
  async function rebuildStatistics() {
    const jobId = loaded?.rebuild?.jobId;
    if (!jobId) return;
    setSaving(true);
    setError(null);
    const failed = (message: string) => {
      setError(message);
      setRebuildFailed(true);
      setSaving(false);
      router.refresh();
    };
    try {
      const res = await fetch(`/api/splitstep/jobs/${jobId}/rederive`, {
        method: "POST",
      });
      if (!res.ok) {
        failed(
          "The score is saved, but the statistics couldn't be rebuilt. Try again, or close to keep the statistics as they were.",
        );
        return;
      }
      setSaving(false);
      setRebuildFailed(false);
      onOpenChange(false);
      push({ tone: "success", title: "Saved and statistics rebuilt" });
      forgetMatchDetails(matchId);
      router.refresh();
    } catch {
      failed(
        "The score is saved, but the server couldn't be reached, so the statistics may not have been rebuilt. Reload the page to check.",
      );
    }
  }

  async function removeFromEvent() {
    if (!event || detaching) return;
    setDetaching(true);
    setDetachError(null);
    try {
      const detached = await detachMatchFromLine({ matchId });
      if (!detached.ok) {
        setDetachError(detached.error);
        setDetaching(false);
        return;
      }
      setDetaching(false);
      setRemoving(false);
      push({ tone: "success", title: `Removed from ${detached.eventName}` });
      forgetMatchDetails(matchId);
      // Reload the match: off the line, the Event field is back and editable.
      setReloadKey((k) => k + 1);
      router.refresh();
    } catch {
      setDetachError(
        "Couldn't reach the server, so it may not have been removed. Reload the page to check.",
      );
      setDetaching(false);
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────
  /** A tournament line's round is the one chosen in the dialog; a dual's is its slot. */
  const pendingLineRound =
    pendingLine?.eventKind === "tournament"
      ? round || null
      : (pendingLine?.round ?? null);
  let description: React.ReactNode = "Correct the score, players and details.";
  if (match && event) {
    description = (
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <span>
          {eventContextLine({
            eventName: event.eventName,
            eventKind: event.eventKind,
            slot: event.slot,
            // An editable round reads the dialog's choice, as a pending line does.
            round: lineRoundEditable ? round || null : match.round,
            date: dayOf(match.date) || event.startsOn,
            surface: event.surface,
          })}
        </span>
        {SCHEDULE_ENABLED && (
          <Link
            href={`/dashboard/team/schedule/${event.eventId}`}
            className="inline-flex items-center gap-0.5 font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
          >
            Open
            <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </span>
    );
  } else if (match && pendingLine) {
    description = (
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <span>
          {eventContextLine({
            eventName: pendingLine.eventName,
            eventKind: pendingLine.eventKind,
            slot: pendingLine.slot,
            round: pendingLineRound,
            date:
              pendingLine.eventKind === "dual" || !pendingLine.sameDay
                ? pendingLine.startsOn
                : date,
            surface: pendingLine.surface,
          })}
        </span>
        <button
          type="button"
          onClick={startChange}
          disabled={saving}
          className="cursor-pointer font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
        >
          Change
        </button>
      </span>
    );
  } else if (match) {
    description = `${surname(player.name || match.player1_name)} vs ${surname(
      opponent.name || match.player2_name,
    )} · ${dayLabel(date || dayOf(match.date))}`;
  }

  // ── Closing lines ─────────────────────────────────────────────────────────
  const formatSentence = match
    ? formatLine({
        format: {
          bestOf: match.format?.best_of ?? null,
          adScoring: match.format?.ad_scoring ?? null,
          playOnLets: match.format?.play_on_lets ?? null,
        },
        analyzed,
        linked,
        durationMs: match.duration,
      })
    : null;

  const ready = loaded !== null && !loadError;

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Edit match"
      description={loadError ? "Nothing was changed." : description}
      footer={
        ready ? (
          <>
            {pendingLine && (
              <button
                type="button"
                onClick={() => setPendingLine(null)}
                disabled={saving}
                className="h-9 cursor-pointer text-[12px] font-medium text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)]"
              >
                Keep as one-off
              </button>
            )}
            {/* The opt-out, in the footer's quiet left slot so the dialog
                keeps one primary. It saves every edit, just no rebuild. */}
            {rebuildOffer && !rebuildFailed && (
              <button
                type="submit"
                form={FORM_ID}
                data-rebuild="false"
                disabled={saving || !!invalidSet || lineupBlocks}
                className="h-9 cursor-pointer text-[12px] font-medium text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)] disabled:pointer-events-none disabled:opacity-50"
              >
                Save without rebuilding
              </button>
            )}
            <div className="flex-1" />
            {rebuildFailed ? (
              // Saved; only the rebuild is left to try.
              <>
                <button
                  type="button"
                  className={advButton("outline")}
                  disabled={saving}
                  onClick={close}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={advButton("primary")}
                  disabled={saving}
                  onClick={() => void rebuildStatistics()}
                >
                  {saving && (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  )}
                  {saving ? "Rebuilding…" : "Try again"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={advButton("outline")}
                  disabled={saving}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form={FORM_ID}
                  data-rebuild={rebuildOffer ? "true" : undefined}
                  // Blue even when bookmarks go: rebuilding is the recommended
                  // path, and the note under the score already states the cost.
                  className={advButton("primary")}
                  disabled={saving || !!invalidSet || lineupBlocks}
                >
                  {saving && (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  )}
                  {rebuildOffer ? "Save and rebuild" : "Save changes"}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              onClick={close}
            >
              Close
            </button>
          </>
        )
      }
    >
      {loadError ? (
        <DialogProblem message={loadError} />
      ) : !match ? (
        <EditMatchPending />
      ) : (
        <form
          id={FORM_ID}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          // The shell doesn't scroll; the body does. The negative margin keeps
          // fields on the shell's inset while giving focus rings room.
          className="-mx-6 flex max-h-[min(66vh,640px)] flex-col gap-10 overflow-y-auto px-6 py-0.5"
        >
          <div className="flex flex-col gap-3">
            <EditMatchScore
              value={score}
              onChange={setScore}
              playerName={player.name}
              opponentName={opponent.name}
              bestOf={format.bestOf}
              gamesTo={gamesTo}
              disabled={saving}
            />
            {rebuildOffer && !rebuildFailed && (
              <DialogInfoRow
                icon={<RefreshCw className="size-[13px]" strokeWidth={1.5} />}
              >
                The score changed. Rebuilding checks this match&rsquo;s analysis
                against it, so its statistics can change.
                {bookmarksLost > 0 &&
                  (bookmarksLost === 1
                    ? " It also removes the 1 bookmarked point on this match."
                    : ` It also removes the ${bookmarksLost} bookmarked points on this match.`)}
              </DialogInfoRow>
            )}
          </div>

          <EditMatchPlayers
            player={player}
            opponent={opponent}
            onPlayer={(next) => {
              setPlayer(next);
              clearFieldError("player1_name");
            }}
            onOpponent={(next) => {
              setOpponent(next);
              clearFieldError("player2_name");
            }}
            errors={{
              player: fieldErrors.player1_name,
              opponent: fieldErrors.player2_name,
            }}
            playerRef={p1Ref}
            opponentRef={p2Ref}
            disabled={saving}
            roster={roster}
            playerId={playerId}
            onPickPlayer={(next) => void pickRosterPlayer(next)}
            playerLock={
              linked
                ? "lineup"
                : analyzed && roster !== null
                  ? "analysis"
                  : null
            }
            playerChanged={playerChanged}
            playerNote={styleNote(player, playerPrefill)}
            opponentNote={styleNote(opponent, opponentPrefill)}
            rosterLabel={
              inMatchProgram
                ? `Roster · ${workspaceLabel(workspace.active)}`
                : "Roster"
            }
            viewerId={workspace.viewer.id}
            myPlayerId={inMatchProgram ? workspace.active.myPlayerId : null}
          />

          {linked || pendingLine ? (
            <section className="flex flex-col gap-3">
              {pendingLine?.lineupMismatch && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`${warningStripCls} pb-1.5 ${noticeEnterCls}`}
                >
                  <WarningGlyph />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p>
                      <b className="font-medium">
                        {lineName(pendingLine)}&rsquo;s lineup has{" "}
                        {pendingLine.lineupMismatch}, not{" "}
                        {player.name || "your player"}.
                      </b>{" "}
                      Whose result is this?
                    </p>
                    <div className="-ml-2.5 flex flex-col">
                      <Answer onClick={() => setPendingLine(null)}>
                        Keep it off the schedule
                      </Answer>
                      <Answer onClick={startChange}>Choose another line</Answer>
                    </div>
                  </div>
                </div>
              )}
              {droppedDetails && !pendingLine?.lineupMismatch && (
                <div
                  role="status"
                  className={`${noteStripCls} ${noticeEnterCls}`}
                >
                  <Info
                    className={`${noteIconCls} text-[var(--ink-700)]`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <p className="flex-1">{droppedDetails}</p>
                </div>
              )}
              {pendingLine?.formatDiffers && !pendingLine.lineupMismatch && (
                <div className={`${noteStripCls} ${noticeEnterCls}`}>
                  <Info
                    className={`${noteIconCls} text-[var(--ink-700)]`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <p className="flex-1">
                    The {pendingLine.eventKind} is set to{" "}
                    {formatPhrase({
                      bestOf: pendingLine.eventBestOf,
                      adScoring: pendingLine.eventAdScoring,
                      playOnLets: null,
                    })}
                    ; this match {analyzed ? "was analyzed" : "is recorded"} as{" "}
                    {formatPhrase({
                      bestOf: match.format?.best_of ?? 3,
                      adScoring: match.format?.ad_scoring ?? null,
                      playOnLets: null,
                    })}
                    . The match keeps its format, and the line shows the score
                    as entered.
                  </p>
                </div>
              )}
              {pendingLine?.eventKind === "tournament" && (
                <div className="grid grid-cols-2 gap-x-4">
                  <EventRoundField
                    value={round}
                    takenRounds={pendingLine.takenRounds}
                    onChange={(next) => {
                      setRound(next);
                      clearFieldError("round");
                    }}
                    disabled={saving}
                    error={fieldErrors.round}
                  />
                </div>
              )}
              {lineRoundEditable && event && (
                <div className="grid grid-cols-2 gap-x-4">
                  <EventRoundField
                    value={round}
                    takenRounds={event.takenRounds.filter(
                      (taken) => taken !== storedRound,
                    )}
                    onChange={(next) => {
                      setRound(next);
                      clearFieldError("round");
                    }}
                    disabled={saving || detaching}
                    error={fieldErrors.round}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1 text-[12px] leading-[1.5] text-[var(--ink-500)]">
                {formatSentence && <span>{formatSentence}</span>}
                {pendingLine ? (
                  <span>
                    Saving makes this the result for{" "}
                    {pendingLine.eventKind === "tournament"
                      ? (pendingLineRound ?? "the round you choose")
                      : lineName(pendingLine)
                            .toLowerCase()
                            .startsWith("singles")
                        ? `singles line ${pendingLine.slot?.slice(1)}`
                        : lineName(pendingLine)}
                    .{" "}
                    {pendingLine.eventKind === "dual"
                      ? "The date, line and surface will come from the dual."
                      : "It keeps the round set here; the event name and surface come from the tournament."}
                  </span>
                ) : (
                  event && (
                    <LinkedEventLine
                      eventKind={event.eventKind}
                      canDetach={!!loaded?.canDetach}
                      canEditRound={lineRoundEditable}
                      scheduleHint={SCHEDULE_ENABLED}
                      onRemove={() => {
                        setDetachError(null);
                        setRemoving(true);
                      }}
                      disabled={saving || detaching}
                    />
                  )
                )}
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-3.5" aria-label="Details">
              <EventField
                value={tournament}
                onChange={setTournament}
                disabled={saving}
                picker={
                  picking ? (
                    <AttachLinePicker
                      load={(query) =>
                        findAttachableLines({
                          matchId,
                          query,
                          unsaved: {
                            player: unsavedPlayer,
                            round: round || null,
                            date: date || null,
                          },
                        })
                      }
                      loadKey={JSON.stringify([
                        matchId,
                        unsavedPlayer,
                        round || null,
                        date || null,
                      ])}
                      onPick={pickLine}
                      onClose={closePicker}
                    />
                  ) : null
                }
                // No one-off note or "Add to an event" while the Schedule is a
                // coming-soon page (`lib/schedule/availability.ts`).
                teamMatch={SCHEDULE_ENABLED && !!match.program_id}
                canAttach={!!loaded?.canAttach}
                onAdd={() => setPicking(true)}
              />

              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <SettingsField
                  label="Date"
                  required
                  labelless
                  hint={
                    fieldErrors.date && (
                      <span className="text-[var(--danger)]">
                        {fieldErrors.date}
                      </span>
                    )
                  }
                >
                  <DateField
                    label="Date"
                    variant="underline"
                    handleRef={dateRef}
                    value={date}
                    required
                    disabled={saving}
                    onChange={(next) => {
                      setDate(next);
                      clearFieldError("date");
                    }}
                    onIncompleteChange={(incomplete) => {
                      setDateIncomplete(incomplete);
                      if (!incomplete) clearFieldError("date");
                    }}
                  />
                </SettingsField>

                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-[11px] text-[var(--ink-600)]">
                    Match type
                  </span>
                  <MenuSelect
                    label="Match type"
                    variant="underline"
                    placeholder="Not set"
                    value={matchType || undefined}
                    options={withLegacy(matchType, MATCH_TYPE_OPTIONS)}
                    disabled={saving}
                    onChange={(v) => {
                      const next = v === NOT_SET ? "" : v;
                      setMatchType(next);
                      const kind = roundKindFor(next || null);
                      // Keep a round only where it belongs: a code from the
                      // new type's list, or a stored value that is in no list.
                      if (!kind || !roundFits(normalizeRound(round), kind)) {
                        setRound(
                          kind && legacyRound && legacyRound === round
                            ? round
                            : "",
                        );
                      }
                    }}
                  />
                </div>
                {roundKind && (
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[11px] text-[var(--ink-600)]">
                      {roundKind === "dual" ? "Line" : "Round"}
                    </span>
                    <MenuSelect
                      label={roundKind === "dual" ? "Line" : "Round"}
                      variant="underline"
                      placeholder="Not set"
                      value={round || undefined}
                      width={220}
                      options={withLegacy(round, roundOptionsFor(roundKind))}
                      disabled={saving}
                      onChange={(v) => setRound(v === NOT_SET ? "" : v)}
                    />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-[11px] text-[var(--ink-600)]">
                    Court surface
                  </span>
                  <MenuSelect
                    label="Court surface"
                    variant="underline"
                    placeholder="Not set"
                    value={courtType || undefined}
                    options={withLegacy(courtType, COURT_TYPE_OPTIONS)}
                    disabled={saving}
                    onChange={(v) => setCourtType(v === NOT_SET ? "" : v)}
                  />
                </div>
              </div>

              {formatEditable && (
                <div className="grid grid-cols-3 gap-x-4">
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[11px] text-[var(--ink-600)]">
                      Format
                    </span>
                    <MenuSelect
                      label="Format"
                      variant="underline"
                      value={String(format.bestOf) as "1" | "3" | "5"}
                      options={BEST_OF}
                      disabled={saving}
                      onChange={(v) =>
                        setFormat((f) => ({ ...f, bestOf: Number(v) }))
                      }
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[11px] text-[var(--ink-600)]">
                      Scoring
                    </span>
                    <MenuSelect
                      label="Scoring"
                      variant="underline"
                      placeholder="Not set"
                      value={
                        format.adScoring === null
                          ? undefined
                          : format.adScoring
                            ? "ad"
                            : "no-ad"
                      }
                      options={SCORING}
                      disabled={saving}
                      onChange={(v) =>
                        setFormat((f) => ({ ...f, adScoring: v === "ad" }))
                      }
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[11px] text-[var(--ink-600)]">
                      Lets
                    </span>
                    <MenuSelect
                      label="Lets"
                      variant="underline"
                      placeholder="Not set"
                      value={
                        format.playOnLets === null
                          ? undefined
                          : format.playOnLets
                            ? "play-on"
                            : "replay"
                      }
                      options={LETS}
                      disabled={saving}
                      onChange={(v) =>
                        setFormat((f) => ({
                          ...f,
                          playOnLets: v === "play-on",
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {formatSentence && (
                <span className="text-[12px] leading-[1.5] text-[var(--ink-500)]">
                  {formatSentence}
                </span>
              )}
            </section>
          )}

          <DialogProblem message={error} />
        </form>
      )}
      {event && (
        <ConfirmDialog
          open={removing}
          onOpenChange={(next) => {
            if (!detaching) setRemoving(next);
          }}
          title="Remove from event?"
          description={
            <>
              Takes this match off <Em>{event.eventName}</Em>. The match, its
              score and its statistics stay as they are.
            </>
          }
          tone="danger"
          confirmLabel="Remove from event"
          pendingLabel="Removing…"
          pending={detaching}
          error={detachError}
          onConfirm={() => void removeFromEvent()}
        />
      )}
    </RosterDialog>
  );
}
