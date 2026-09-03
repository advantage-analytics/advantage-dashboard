"use client";

/**
 * FileStepContent — step 2: the file.
 *
 * One drop zone, three facts about what the file has to be, and — once a file
 * passes — the same 40px row anatomy step 1 uses: lead, name, mono facts ending
 * in the one word that matters ("checked" for a video, "read" for an export).
 * Both provider kinds render here; only the nouns, the glyph and the three
 * requirements change. Design: Upload Wizard v5, frames 3a · 3b · 5a · 5b.
 *
 * Nothing leaves the browser on this step. A video is probed locally for its
 * resolution, duration and frame rate; an export is read for the names and the
 * score so the details step opens filled. The upload itself starts when the
 * match is saved — the note strip says so in as many words, because "checked"
 * beside a 7 GB file otherwise reads as "sent".
 */

import { memo, useEffect, useId, useRef } from "react";
import {
  FileSpreadsheet,
  Film,
  Hash,
  Info,
  Loader2,
  Scan,
  Swords,
  TriangleAlert,
  User,
  Users,
  Video,
  X,
  XCircle,
} from "lucide-react";
import type { ProviderId, ProviderKind } from "@/lib/services/upload";
import type {
  FormData,
  ParsingState,
  UploadedFile,
  VideoProbeSummary,
} from "./types";
import { noteStripCls } from "./styles";
import {
  formatResolution,
  formatTimecode,
  getNumberOfSets,
} from "./utils";

export interface FileStepContentProps {
  kind: ProviderKind;
  selectedProvider: ProviderId | null;
  /**
   * Whose match this is, when it is not the uploader's own — "Marcus" on a
   * team upload for a roster player. Null makes the zone say "your".
   */
  subjectFirstName: string | null;
  uploadedFile: UploadedFile | null;
  /** Processing providers only: what the local probe read off the video. */
  probe: VideoProbeSummary | null;
  /** Probe warnings — the file passed, with a caveat worth one line. */
  warnings: string[];
  /** Probing a video, validating or reading an export. */
  busy: boolean;
  /** Why the file was refused. */
  error: string | null;
  parsingState: ParsingState;
  /** For the "Found in the export" row — the parser has already written here. */
  formData: FormData;
  /** From the provider strategy, so the picker and the validator agree. */
  acceptString: string;
  isOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  onRemove: () => void;
}

interface Requirement {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  lead: string;
  rest: string;
}

/**
 * What the analysis needs, in the note register — 13px glyph, bold lead, one
 * consequence each — rather than behind a help icon, because the person most
 * likely to get them wrong is the one who wouldn't click.
 */
const VIDEO_REQUIREMENTS: readonly Requirement[] = [
  {
    icon: Video,
    lead: "One camera, one position",
    rest: " — a tripod or a phone against the fence. Following the play breaks the court mapping.",
  },
  {
    icon: Scan,
    lead: "Behind the baseline",
    rest: ", high enough to see both service boxes and all four corners of the court.",
  },
  {
    icon: User,
    lead: "Singles, complete games",
    rest: " — the window you trim to has to match the score you enter in step 4.",
  },
];

/** The export's requirements, not the camera's. Doubles is named as not-yet. */
const EXPORT_REQUIREMENTS: readonly Requirement[] = [
  {
    icon: Swords,
    lead: "A match session",
    rest: ", not a practice or ball-machine session — those have shots but no points.",
  },
  {
    icon: Hash,
    lead: "Scored in the app",
    rest: " — final set scores at least, or the stats can't split by set.",
  },
  {
    icon: Users,
    lead: "Singles",
    rest: ", both players tagged in the app so the file knows who's who. Doubles exports aren't read yet.",
  },
];

/** What the zone calls the file, per source. */
function sourceNoun(kind: ProviderKind, provider: ProviderId | null): string {
  if (kind === "processing") return "video";
  if (provider === "swing-vision") return "SwingVision export";
  return "export";
}

/** ".mp4,.mov,video/mp4" → "MP4 · MOV". */
function extensionList(acceptString: string): string {
  return acceptString
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1).toUpperCase())
    .join(" · ");
}

/**
 * A still from the file, as the row's 40px lead.
 *
 * Its own object URL rather than the trim step's: that one is created when the
 * player mounts, two steps from here. A few seconds in rather than frame zero,
 * which on a phone recording is usually the ground.
 */
function VideoStill({ file, durationSeconds }: { file: File; durationSeconds: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  // URL created and revoked in the same effect, src set from it — see the
  // same note in TrimStepContent: a memoised URL revoked from a cleanup is
  // dead by the time development's second effect run looks for it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => {
      // Detach before revoking — Safari otherwise keeps the handle alive.
      el.pause();
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const at = Math.min(5, durationSeconds * 0.05) || 0.001;
  return (
    <video
      ref={ref}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onLoadedMetadata={(e) => {
        if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = at;
      }}
      className="size-10 object-cover opacity-90"
    />
  );
}

/**
 * The superscript for a set, or null when the set had no tiebreak.
 *
 * Two conditions, both required: the games say the set went to one (7-6, or
 * a 1-0 match tiebreak in place of a set), and a recorded value above zero.
 * An export carries a tiebreak column for every set, and a 0 in it — or a
 * value left behind on a 6-3 — must not become a "⁰" or a "⁴" that claims a
 * tiebreak nobody played. The loser's points are the number people write;
 * when both are recorded that is the smaller one.
 */
function tiebreakFor(
  a: number,
  b: number,
  aTiebreak: number | null | undefined,
  bTiebreak: number | null | undefined
): number | null {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const wentToTiebreak = (high >= 7 && high - low === 1) || (high === 1 && low === 0);
  if (!wentToTiebreak) return null;
  const points = [aTiebreak, bTiebreak].filter(
    (n): n is number => typeof n === "number" && n > 0
  );
  return points.length > 0 ? Math.min(...points) : null;
}

/** One set from the winner's side, tiebreak as a superscript. */
function SetScore({ a, b, tiebreak }: { a: number; b: number; tiebreak: number | null }) {
  return (
    <span>
      {a}-{b}
      {tiebreak !== null && (
        <sup className="relative -top-[0.45em] ml-px text-[0.6em] leading-[0]">{tiebreak}</sup>
      )}
    </span>
  );
}

/**
 * The match as the system already draws it — one result row on a
 * surface-subtle wash. "def." and the score say who won; no outcome glyph.
 * Only what the file actually carries: names, sets, format, length. The date
 * is not in the export, so it is not claimed here.
 */
function FoundInExport({ formData }: { formData: FormData }) {
  const player = formData.playerName.trim();
  const opponent = formData.opponentName.trim();
  const playerWon = formData.result === `${player} Wins`;
  const opponentWon = formData.result === `${opponent} Wins`;
  const decided = playerWon || opponentWon;
  const first = opponentWon ? opponent : player;
  const second = opponentWon ? player : opponent;

  const sets: { a: number; b: number; tiebreak: number | null }[] = [];
  const count = getNumberOfSets(formData.bestOf, formData.numberOfSets);
  for (let i = 0; i < count; i++) {
    const p = formData.playerScores[i];
    const o = formData.opponentScores[i];
    if (p === null || p === undefined || o === null || o === undefined) continue;
    const tiebreak = tiebreakFor(p, o, formData.playerTiebreaks[i], formData.opponentTiebreaks[i]);
    sets.push(opponentWon ? { a: o, b: p, tiebreak } : { a: p, b: o, tiebreak });
  }

  const facts = [
    `${sets.length} ${sets.length === 1 ? "set" : "sets"}`,
    `Best of ${formData.bestOf}`,
    formData.adScoring === undefined ? null : formData.adScoring ? "Ad scoring" : "No-ad scoring",
  ].filter(Boolean);
  const durationSeconds = (formData.duration ?? 0) / 1000;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-[5px]">
        <span className="eyebrow">Found in the export</span>
        <span className="text-micro">Details opens with these filled — fix anything wrong there</span>
      </div>
      <div className="flex items-center gap-4 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[13px] leading-[18px] text-[var(--ink-900)]">
            <span className="font-medium">{first || "Player"}</span>{" "}
            <span className="text-[var(--ink-600)]">{decided ? "def." : "vs."}</span>{" "}
            <span className="font-medium">{second || "Opponent"}</span>
          </span>
          <span className="mono tabular text-micro leading-[14px]">{facts.join(" · ")}</span>
        </span>
        {sets.length > 0 && (
          <span className="tabular inline-flex shrink-0 gap-3 text-[16px] font-light text-[var(--ink-900)]">
            {sets.map((s, i) => (
              <SetScore key={i} a={s.a} b={s.b} tiebreak={s.tiebreak} />
            ))}
          </span>
        )}
        {durationSeconds > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--border-medium)]" aria-hidden="true" />
            <span className="mono tabular shrink-0 whitespace-nowrap text-[11px] text-[var(--ink-500)]">
              {formatTimecode(durationSeconds)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function FileStepContentImpl({
  kind,
  selectedProvider,
  subjectFirstName,
  uploadedFile,
  probe,
  warnings,
  busy,
  error,
  parsingState,
  formData,
  acceptString,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemove,
}: FileStepContentProps) {
  const inputId = useId();
  const isVideo = kind === "processing";
  const noun = sourceNoun(kind, selectedProvider);
  const whose = subjectFirstName ? `${subjectFirstName}'s` : "your";
  const requirements = isVideo ? VIDEO_REQUIREMENTS : EXPORT_REQUIREMENTS;
  const Glyph = isVideo ? Film : FileSpreadsheet;

  const extension = uploadedFile?.name.includes(".")
    ? uploadedFile.name.split(".").pop()!.toUpperCase()
    : extensionList(acceptString);

  // The one word that matters, at the end of the facts.
  const exportStatus = parsingState.isParsing
    ? "reading"
    : parsingState.parseError
      ? "not read"
      : parsingState.parseSuccess
        ? "read"
        : "ready";

  const videoFacts = probe
    ? [
        formatTimecode(probe.durationSeconds),
        formatResolution(probe.width, probe.height),
        probe.fps ? `${probe.fps} fps` : null,
        uploadedFile?.size,
        "checked",
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const browse = () => document.getElementById(inputId)?.click();

  const input = (
    <input
      id={inputId}
      type="file"
      accept={acceptString}
      onChange={onFileChange}
      disabled={busy}
      className="hidden"
    />
  );

  const hasFile = Boolean(uploadedFile) && !busy;

  return (
    <div className="flex flex-col gap-9">
      {!hasFile ? (
        <div className="flex flex-col gap-3.5">
          {/* The column's width on the page tone with a 1px dashed hairline —
              the only dashed edge in the product besides the invited avatar,
              and it means the same thing: a place waiting for something real. */}
          <div
            role="button"
            tabIndex={0}
            onClick={busy ? undefined : browse}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                browse();
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            aria-label={`Drop ${whose} ${noun} here, or browse`}
            className={`flex h-[280px] cursor-pointer flex-col items-center justify-center gap-3.5 rounded-[var(--radius-card)] border border-dashed transition-colors duration-200 ease-[var(--ease-primary)] ${
              isOver
                ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                : "border-[var(--border-medium)] bg-[var(--surface-page)] hover:border-[var(--ink-300)]"
            } ${busy ? "cursor-default" : ""}`}
          >
            {busy ? (
              <Loader2
                className="size-7 animate-spin text-[var(--ink-300)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : (
              <Glyph className="size-7 text-[var(--ink-300)]" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="flex flex-col items-center gap-1.5">
              <span className="text-[13px] font-medium text-[var(--ink-900)]">
                {busy ? (
                  isVideo ? "Checking the video…" : "Reading the export…"
                ) : (
                  <>
                    Drop {whose} {noun} here, or{" "}
                    <span className="text-[var(--blue)]">browse</span>
                  </>
                )}
              </span>
              <span className="text-micro">
                {busy
                  ? "Nothing is uploading yet."
                  : isVideo
                    ? `One video per match · ${extensionList(acceptString)} · 1080p or better`
                    : `One export per match · ${extensionList(acceptString)} · from the app's Share → Export`}
              </span>
            </span>
            {input}
          </div>

          {error && (
            <div className={noteStripCls}>
              <XCircle
                className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                <b className="font-medium text-[var(--ink-900)]">
                  {isVideo ? "This video can't be analysed" : "This export couldn't be read"}
                </b>
                {" — "}
                {error}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <span className="eyebrow">{isVideo ? "Video" : "Export"}</span>

          {/* A checked file becomes a step-1 field: 40px lead, 14px name, mono
              facts in the subline. Replace is the quiet blue action; remove is
              a 28px icon square named by its label. */}
          <div className="flex items-center gap-4 border-b border-[var(--border-hairline)] pb-4">
            <span
              className={`inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-button)] ${
                isVideo ? "bg-[var(--ink-900)]" : ""
              }`}
            >
              {isVideo ? (
                uploadedFile?.file ? (
                  <VideoStill file={uploadedFile.file} durationSeconds={probe?.durationSeconds ?? 0} />
                ) : (
                  <Film className="size-4 text-white/70" strokeWidth={1.5} aria-hidden="true" />
                )
              ) : selectedProvider === "swing-vision" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/providers/swingvision-icon.png" alt="" className="size-10" />
              ) : (
                <FileSpreadsheet className="size-5 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[14px] leading-5 text-[var(--ink-900)]">
                {uploadedFile?.name}
              </span>
              <span className="mono tabular text-micro leading-4">
                {isVideo
                  ? videoFacts ?? `${uploadedFile?.size} · checked`
                  : `${extension} · ${uploadedFile?.size} · ${exportStatus}`}
              </span>
            </span>
            <button
              type="button"
              onClick={browse}
              className="cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--ink-900)]"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={isVideo ? "Remove video" : "Remove export"}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
            >
              <X className="size-3.5 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
            </button>
            {input}
          </div>

          {isVideo && (
            /* The honest thing about timing: nothing has left the machine. */
            <div className={noteStripCls}>
              <Info
                className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                Nothing is uploading yet. The upload starts when the match is saved — trimming
                and details come first.
              </span>
            </div>
          )}

          {warnings.map((w) => (
            <div key={w} className={noteStripCls}>
              <TriangleAlert
                className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{w}</span>
            </div>
          ))}

          {parsingState.parseWarnings.map((w) => (
            <div key={w} className={noteStripCls}>
              <TriangleAlert
                className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{w}</span>
            </div>
          ))}

          {parsingState.parseError && (
            <div className={noteStripCls}>
              <XCircle
                className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                <b className="font-medium text-[var(--ink-900)]">Couldn&apos;t read this export</b>
                {" — "}
                {parsingState.parseError} You can still enter the details by hand on the next step.
              </span>
            </div>
          )}
        </div>
      )}

      {/* The requirements stay under a checked video — the trim still has to
          honour them. Under a read export they have been met, and the block
          beneath says what was found instead. */}
      {hasFile && !isVideo && parsingState.parseSuccess ? (
        <FoundInExport formData={formData} />
      ) : (
        <div className="flex flex-col gap-3.5">
          <span className="eyebrow">{isVideo ? "What the analysis needs" : "What the export needs"}</span>
          <div className="flex flex-col gap-2.5">
            {requirements.map(({ icon: Icon, lead, rest }) => (
              <div key={lead} className="flex items-start gap-3">
                <Icon
                  className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
                  <b className="font-medium text-[var(--ink-900)]">{lead}</b>
                  {rest}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const FileStepContent = memo(FileStepContentImpl);
