/**
 * Where `/dashboard/matches/new?videoFor=<matchId>&mode=<mode>` should go, and
 * everything the attachment wizard needs once it is allowed to open (plan step
 * 14, wizard-route half).
 *
 * This is the page counterpart of `add-video-server.ts`: one function that
 * either hands the route a fully-formed set of props or names somewhere else to
 * be. The wizard component itself (T20) decides nothing — it takes its match,
 * its source rows, its active attachment and its return target as props, so
 * every refusal has to happen here, before a single pixel is drawn.
 *
 * ── The ladder, in order ────────────────────────────────────────────────────
 *
 *   1. {@link authorizeMatchVideoMutation} — sign-in, RLS visibility, creator,
 *      SwingVision provenance, and the EXACT active workspace. This is the
 *      shared helper the four API routes already use (T8) and it is the only
 *      authorization on this path: a page that asked the question a second
 *      way is a page that can answer it differently from the endpoints the
 *      wizard is about to call.
 *   2. The mode. Absent, mis-cased or invented is refused, never defaulted —
 *      guessing `add` for an unreadable mode is how a replace becomes a
 *      duplicate.
 *   3. The current attachment state. `add` requires ABSENCE and
 *      `replace`/`align` require PRESENCE. This is the stale-mode check: a
 *      person who opened "Add video" in one tab and finished an upload in
 *      another comes back to a row that now exists, and the honest answer is
 *      to send them to the match rather than to open a second add.
 *   4. The source timing. A SwingVision import whose first or final point has
 *      no usable timestamp cannot be aligned at all, so there is no wizard to
 *      open — `summarizeSourceTiming` (T1) is the same judgement the align and
 *      complete endpoints make, asked here so the refusal arrives before the
 *      file picker rather than after the bytes.
 *
 * ── Refusals are redirects, and which one matters ───────────────────────────
 *
 * Nothing here renders an error page. A refusal that happened because the
 * caller cannot see the match goes to the matches list — naming the match
 * would itself disclose that the id exists. Every refusal on a match the
 * caller CAN see goes to that match's Video view, because that is where the
 * Add / Replace / Adjust actions live and where the current state is visible.
 *
 * ── The playback URL is not a gate ──────────────────────────────────────────
 *
 * `align` needs a read-only URL for the published file, and minting one talks
 * to Azure. When that fails the wizard still opens and states it
 * (`savedPlaybackUrl: null` draws T20's retryable notice) rather than being
 * redirected away: an unreachable store is a transient fact about storage, and
 * bouncing the person back to Film would invite them to press Add instead and
 * create a duplicate over a row that is still active. Same reasoning as
 * `playback.ts`'s refusal to fold `stale_attachment` into `attachment: null`.
 *
 * Dependency-injected ({@link AttachmentWizardDeps}) so the whole ladder runs
 * in a spec with no session, no database and no Azure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  summarizeSourceTiming,
  type SourcePoint,
  type SourceShot,
} from "@/lib/match-video/alignment";
import {
  isMatchVideoMode,
  modeRequiresActiveAttachment,
  type ActiveAttachment,
  type MatchVideoMode,
  type MatchVideoResult,
} from "@/lib/match-video/types";
import {
  authorizeMatchVideoMutation,
  type MatchVideoAccessDeps,
} from "@/lib/services/match-video/access";
import type { HttpResult } from "@/lib/services/match-video/http";
import {
  azurePlaybackStorage,
  supabaseActiveAttachment,
  type PlaybackAttachmentRow,
} from "@/lib/services/match-video/playback";
import type { AttachmentPlaybackCredential } from "@/lib/services/match-video/storage";
import {
  formatScoreText,
  playedSets,
  scoreSetsFrom,
  type RawMatchScore,
} from "@/lib/ui/score-format";
import type { AttachmentMatchSummary } from "@/components/dashboard/matches/match-video-attachment/MatchVideoAttachmentFlow";

const LOG = "[match-video-attachment-target]";

/* -------------------------------------------------------------------------
 * Destinations
 * ---------------------------------------------------------------------- */

/** The matches list: the one place a caller who cannot see the match may go. */
export const MATCHES_LIST_HREF = "/dashboard/matches";

/**
 * A match's Video view.
 *
 * `?tab=film` is the EXISTING selection contract — `parseReportView()` in
 * `components/dashboard/matches/match-detail/report-view.ts` reads it, and
 * `reportViewQuery()` writes it. Match detail is a single page with no
 * sub-routes, so this query parameter is the whole mechanism; no new one was
 * invented for this feature, and T22's return after a successful save uses
 * this same href.
 */
export function matchFilmHref(matchId: string): string {
  return `/dashboard/matches/${encodeURIComponent(matchId)}?tab=film`;
}

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

/** The props the route hands straight to `MatchVideoAttachmentFlow`. */
export interface AttachmentWizardProps {
  matchId: string;
  mode: MatchVideoMode;
  match: AttachmentMatchSummary;
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  activeAttachment: ActiveAttachment | null;
  savedPlaybackUrl: string | null;
  returnTarget: { href: string; label?: string };
}

export type AttachmentWizardTarget =
  | { kind: "wizard"; props: AttachmentWizardProps }
  | { kind: "redirect"; href: string };

/** The display facts pinned under the step bar, read from `matches`. */
export interface AttachmentSummaryRow {
  player1_name: string | null;
  player2_name: string | null;
  date: string | null;
  tournament_name: string | null;
  score: RawMatchScore | null;
}

/** The imported rows the alignment step measures against. */
export interface AttachmentSourceRows {
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
}

export interface AttachmentWizardDeps extends MatchVideoAccessDeps {
  /**
   * The ACTIVE attachment row, or null. Service-role, exactly as playback
   * reads it — `match_video_attachments` has no client grant — and safe only
   * because authorization has already run above it.
   */
  loadActiveAttachment(
    matchId: string,
  ): Promise<HttpResult<PlaybackAttachmentRow | null>>;
  /** Read-only (`r`) SAS on the published file. Never an upload credential. */
  mintPlayback(
    row: PlaybackAttachmentRow,
  ): MatchVideoResult<AttachmentPlaybackCredential>;
  /** Display facts only. `null` when the row cannot be read. */
  loadSummary(matchId: string): Promise<AttachmentSummaryRow | null>;
  /** The imported points and shots, or null when they cannot be read. */
  loadSourceRows(matchId: string): Promise<AttachmentSourceRows | null>;
}

/* -------------------------------------------------------------------------
 * The ladder
 * ---------------------------------------------------------------------- */

/**
 * The pinned subject.
 *
 * `score` arrives pre-formatted because the wizard states it as a fact and
 * must never re-derive it. The formatter is the shared one every list and rail
 * already uses (`lib/ui/score-format.ts`), trailing unplayed sets trimmed the
 * same way — a second spelling of a score in this app is a bug, not a style.
 */
export function attachmentMatchSummary(
  row: AttachmentSummaryRow,
): AttachmentMatchSummary {
  const sets = playedSets(scoreSetsFrom(row.score));
  return {
    playerName: row.player1_name ?? "—",
    opponentName: row.player2_name,
    date: row.date ? String(row.date).slice(0, 10) : "",
    eventName: row.tournament_name,
    score: sets.length > 0 ? formatScoreText(sets) : null,
  };
}

/** The saved row, in the shape the wizard's optimistic concurrency wants. */
function activeAttachmentOf(row: PlaybackAttachmentRow): ActiveAttachment {
  return {
    id: row.id,
    version: row.version,
    offsetSeconds: row.offset_seconds,
    confirmedVideoTimeSeconds: row.confirmed_video_time_seconds,
    durationSeconds: row.verified_duration_seconds,
    contentType: row.verified_content_type,
    filename: row.filename,
  };
}

/**
 * Resolve one `?videoFor=&mode=` visit.
 *
 * `rawMode` is whatever the URL carried — a string, an array Next flattened, or
 * nothing at all. It is validated, never coerced.
 */
export async function resolveAttachmentWizardTarget(
  matchId: string,
  rawMode: unknown,
  deps: AttachmentWizardDeps,
): Promise<AttachmentWizardTarget> {
  // 1. The shared gate. A malformed id never reaches a query: `isUuid` runs
  //    inside it, before the read.
  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    // `match_not_found` covers both "no such id" and "not yours to see", and
    // both must land somewhere that does not confirm the id exists.
    return {
      kind: "redirect",
      href:
        access.error.code === "match_not_found" ||
        access.error.code === "unauthenticated" ||
        access.error.code === "storage_unavailable"
          ? MATCHES_LIST_HREF
          : matchFilmHref(matchId),
    };
  }
  const id = access.value.match.id;
  const film = matchFilmHref(id);

  // 2. The mode. No default: see the header.
  if (!isMatchVideoMode(rawMode)) {
    console.log(`${LOG} refused — unreadable mode`, { matchId: id });
    return { kind: "redirect", href: film };
  }
  const mode: MatchVideoMode = rawMode;

  // 3. What is actually attached right now.
  const loaded = await deps.loadActiveAttachment(id);
  if (!loaded.ok) {
    console.error(`${LOG} could not read the active attachment`, {
      matchId: id,
      detail: loaded.error.detail,
    });
    return { kind: "redirect", href: film };
  }
  const row = loaded.value;

  // The stale-mode refusal. Add against an existing video would be a second
  // attachment; replace or adjust against nothing has no subject.
  if (modeRequiresActiveAttachment(mode) !== (row !== null)) {
    console.log(`${LOG} refused — mode does not match the saved state`, {
      matchId: id,
      mode,
      hasActive: row !== null,
    });
    return { kind: "redirect", href: film };
  }

  // 4. The imported timing. Unalignable data means there is no wizard to open.
  const source = await deps.loadSourceRows(id);
  if (!source) {
    console.error(`${LOG} could not read the imported rows`, { matchId: id });
    return { kind: "redirect", href: film };
  }
  const timing = summarizeSourceTiming(source.points, source.shots);
  if (!timing.ok) {
    console.log(`${LOG} refused — ${timing.error.detail}`, { matchId: id });
    return { kind: "redirect", href: film };
  }

  const summary = await deps.loadSummary(id);
  if (!summary) {
    console.error(`${LOG} could not read the match summary`, { matchId: id });
    return { kind: "redirect", href: film };
  }

  // The playback URL, for `align` only, and never a gate — see the header. A
  // failure here opens the wizard with a stated problem; it does not bounce.
  let savedPlaybackUrl: string | null = null;
  if (mode === "align" && row) {
    const credential = deps.mintPlayback(row);
    if (credential.ok) {
      savedPlaybackUrl = credential.value.playbackUrl;
    } else {
      console.error(
        `${LOG} could not mint a playback credential — ${credential.error.detail}`,
        { matchId: id, attachmentId: row.id },
      );
    }
  }

  return {
    kind: "wizard",
    props: {
      matchId: id,
      mode,
      match: attachmentMatchSummary(summary),
      points: source.points,
      shots: source.shots,
      activeAttachment: row ? activeAttachmentOf(row) : null,
      savedPlaybackUrl,
      returnTarget: { href: film, label: "Cancel" },
    },
  };
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

/**
 * The display facts, through the CALLER's client.
 *
 * RLS-scoped on purpose although authorization has already passed: this is the
 * same row `loadVisibleMatch` read, and reading it a second way with the
 * service role would be a privilege the page has no use for.
 */
export function supabaseAttachmentSummary(
  supabase: SupabaseClient,
): AttachmentWizardDeps["loadSummary"] {
  return async (matchId) => {
    const { data, error } = await supabase
      .from("matches")
      .select("player1_name, player2_name, date, tournament_name, score")
      .eq("id", matchId)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as AttachmentSummaryRow;
  };
}

/**
 * The imported points and shots.
 *
 * Paged for the same reason `match-points-server.ts` pages: PostgREST caps a
 * response at 1000 rows and a full three-set match passes that. A truncated
 * read here is not a cosmetic loss — `summarizeSourceTiming` would take a
 * mid-match point for the final one and declare a shorter recording
 * sufficient, so a partial page must never look like the end of the list.
 *
 * `shots` carries no `match_id` of its own; it hangs off `points`, so the
 * filter is the embedded `points!inner(match_id)` every other shot loader in
 * `lib/data` uses. Only `video_time` is read — this path needs instants, never
 * placements.
 *
 * An error on any page returns null rather than a short list, for the same
 * reason: half the timeline is a wrong answer that looks like a right one.
 */
export function supabaseAttachmentSourceRows(
  supabase: SupabaseClient,
): AttachmentWizardDeps["loadSourceRows"] {
  const PAGE = 1000;

  return async (matchId) => {
    const points: SourcePoint[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("points")
        .select("point_number, video_time, duration")
        .eq("match_id", matchId)
        .order("point_number", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return null;
      const page = (data ?? []) as unknown as {
        point_number: number | null;
        video_time: number | null;
        duration: number | null;
      }[];
      for (const point of page) {
        points.push({
          pointNumber: Number(point.point_number),
          videoTime:
            point.video_time === null ? null : Number(point.video_time),
          duration: point.duration === null ? null : Number(point.duration),
        });
      }
      if (page.length < PAGE) break;
    }

    const shots: SourceShot[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("shots")
        .select("id, video_time, points!inner(match_id)")
        .eq("points.match_id", matchId)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return null;
      const page = (data ?? []) as unknown as {
        video_time: number | null;
      }[];
      for (const shot of page) {
        shots.push({
          videoTime: shot.video_time === null ? null : Number(shot.video_time),
        });
      }
      if (page.length < PAGE) break;
    }

    return { points, shots };
  };
}

/**
 * The attachment seams: the service-role row read and the read-only signature,
 * both borrowed from `playback.ts` rather than restated. The admin client is
 * built lazily behind a proxy so a refused visit — every check above this one
 * runs first — never constructs one.
 */
export function attachmentWizardStorageDeps(
  admin: SupabaseClient,
): Pick<AttachmentWizardDeps, "loadActiveAttachment" | "mintPlayback"> {
  return {
    loadActiveAttachment: supabaseActiveAttachment(admin),
    mintPlayback: azurePlaybackStorage().mintPlayback,
  };
}
