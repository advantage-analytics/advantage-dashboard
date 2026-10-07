export const COL = {
  players: "min-w-0 flex-1",
  job: "w-[168px] shrink-0",
  points: "w-[90px] shrink-0 text-right",
  progress: "w-[200px] shrink-0",
  action: "w-[136px] shrink-0 flex justify-end",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order. The
 * action lane carries no label: it is the row's own control, not a fact about
 * it.
 */
export const LABELS_COLUMNS: readonly { label: string; col: string }[] = [
  { label: "Match", col: COL.players },
  { label: "Job", col: COL.job },
  { label: "Points", col: COL.points },
  { label: "Progress", col: COL.progress },
];
