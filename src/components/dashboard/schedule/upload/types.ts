import type { VideoProbe } from "@/lib/video/probe";
import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";

export type UploadStep = "matches" | "files" | "details" | "confirm";

export const STEP_ORDER: UploadStep[] = ["matches", "files", "details", "confirm"];

/** A line the coach ticked, carried with its event so headings can name it. */
export interface SelectedEntry {
  entry: EventEntry;
  event: ProgramEvent;
}

/**
 * What is attached to one line.
 *
 * Two kinds, and they are genuinely different jobs. A video goes to Advantage
 * Intelligence and needs a trim window and the two camera answers; a
 * SwingVision export already carries computed numbers, so it needs neither and
 * runs the untouched file-import pipeline instead.
 */
export type AttachedFile =
  | {
      kind: "video";
      file: File;
      probe: VideoProbe | null;
      startSeconds: number;
      endSeconds: number;
    }
  | { kind: "import"; file: File };

/** Per-line answers the event cannot supply. */
export interface LineAnswers {
  /** Was our player at the TOP of the frame at video start? Camera-relative. */
  startsTop: boolean | null;
  /** Only collected when the line's match has no score yet. */
  ourGames: string[];
  theirGames: string[];
  ourTiebreaks: string[];
  theirTiebreaks: string[];
  opponent: string;
}

export function emptyAnswers(opponent: string): LineAnswers {
  return {
    startsTop: null,
    ourGames: ["", "", ""],
    theirGames: ["", "", ""],
    ourTiebreaks: ["", "", ""],
    theirTiebreaks: ["", "", ""],
    opponent,
  };
}

/** Trimmed length in seconds, or the whole file when nobody trimmed it. */
export function billableSeconds(attached: AttachedFile): number {
  if (attached.kind !== "video") return 0;
  const span = attached.endSeconds - attached.startSeconds;
  return span > 0 ? span : (attached.probe?.durationSeconds ?? 0);
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** "3h 27m" — the pool readout's unit, which is hours, not clock time. */
export function formatSpan(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.round((whole % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}
