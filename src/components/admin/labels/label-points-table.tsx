import { Check, ChevronDown, ClipboardList } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { StatePill } from "@/components/ui/state-pill";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { cn } from "@/lib/utils";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import {
  ENDING_LABEL,
  RESULT_LABEL,
  STROKE_LABEL,
  formatCourtPoint,
  formatVideoTime,
  type SideNames,
} from "./label-format";
import {
  POINT_COLUMNS,
  POINT_GRID,
  SHOT_COLUMNS,
  SHOT_GRID,
} from "./label-table-layout";

/**
 * The console's points table — board 08's lower half, read-only (T5).
 *
 * One row per `label_points` row, in `point_index` order; the expanded
 * point's strokes fold underneath it in video order (the loader already put
 * them there with `orderLabelShots`). Every cell is plain text here: T6 turns
 * the right-hand columns and the shot cells into editors, T7 turns the
 * deleted markers into expanders with Undo.
 *
 * A tombstone is not drawn as a row at all. A deleted point or shot is a thin
 * red rule with a "Deleted point" / "Deleted shot" pill on it — present, so
 * the labeller can see something was removed there, but never read as a
 * point to check or a stroke to count.
 *
 * Stateless: which point is open is the caller's (`LabelConsole` holds it),
 * so a spec can render any point expanded without clicking.
 */
export function LabelPointsTable({
  points,
  names,
  expandedPointId,
  onTogglePoint,
}: {
  points: readonly LabelPoint[];
  names: SideNames;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[900px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            POINT_GRID,
            "min-h-[34px] border-b border-[var(--border-hairline)]",
          )}
        >
          {POINT_COLUMNS.map((column, i) => (
            <span
              key={i}
              className={cn(
                "text-[12px] whitespace-nowrap",
                column.calculated
                  ? "text-[var(--ink-400)]"
                  : "text-[var(--ink-500)]",
              )}
            >
              {column.label}
            </span>
          ))}
        </div>

        {points.length === 0 ? (
          <TableEmptyBody
            icon={ClipboardList}
            title="This session has no points"
          />
        ) : (
          points.map((point) =>
            point.status === "deleted" ? (
              <DeletedMarker key={point.id} kind="point" />
            ) : (
              <PointRow
                key={point.id}
                point={point}
                names={names}
                open={point.id === expandedPointId}
                onToggle={onTogglePoint}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

function PointRow({
  point,
  names,
  open,
  onToggle,
}: {
  point: LabelPoint;
  names: SideNames;
  open: boolean;
  onToggle?: (pointId: string) => void;
}) {
  const number = point.pointIndex + 1;
  const shotsId = `label-point-${point.id}-shots`;
  const liveShots = point.shots.filter((shot) => shot.status !== "deleted");

  return (
    <>
      <div
        data-row="point"
        data-point-id={point.id}
        onClick={() => onToggle?.(point.id)}
        className={cn(
          POINT_GRID,
          "-mx-4 min-h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 text-[13px] transition-colors duration-200",
          open
            ? "rounded-b-none bg-[var(--surface-muted)]"
            : "hover:bg-[var(--surface-muted)]",
        )}
      >
        {/* The row's one control. The row's own click does the same thing
            for a mouse; this is what a keyboard and a screen reader reach. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? shotsId : undefined}
          aria-label={`${open ? "Hide" : "Show"} shots for point ${number}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.(point.id);
          }}
          className="-ml-1 flex size-6 items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-400)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>

        <span
          className={cn(
            "tabular",
            open
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          {number}
        </span>
        <Calculated>
          {point.setNumber !== null && point.gameNumber !== null
            ? `${point.setNumber} · ${point.gameNumber}`
            : null}
        </Calculated>
        <Calculated>{sideLabel(point.server, names)}</Calculated>
        <Calculated>{liveShots.length}</Calculated>
        <span aria-hidden="true" />

        <Labelled>{sideLabel(point.winner, names)}</Labelled>
        <Labelled>{point.ending ? ENDING_LABEL[point.ending] : null}</Labelled>
        <Labelled>{sideLabel(point.endedBy, names)}</Labelled>
        <PointStatus checked={point.checkedAt !== null} />
      </div>

      {open ? (
        <div
          id={shotsId}
          data-shots-for={point.id}
          className="-mx-4 mb-2 rounded-b-[var(--radius-element)] bg-[var(--surface-page)] pb-1.5 shadow-[inset_0_1px_0_var(--border-hairline)]"
        >
          <div className={cn(SHOT_GRID, "min-h-[34px]")}>
            {SHOT_COLUMNS.map((label) => (
              <span
                key={label}
                className="text-[12px] whitespace-nowrap text-[var(--ink-400)]"
              >
                {label}
              </span>
            ))}
          </div>
          {point.shots.length === 0 ? (
            <p className="pl-11 text-[12px] text-[var(--ink-500)]">
              No strokes on this point
            </p>
          ) : (
            <ShotRows shots={point.shots} names={names} />
          )}
        </div>
      ) : null}
    </>
  );
}

/**
 * The strokes, numbered 1…n among the live ones: a tombstone takes no number,
 * so the numbers are the rally as the labeller now says it went.
 */
function ShotRows({
  shots,
  names,
}: {
  shots: readonly LabelShot[];
  names: SideNames;
}) {
  let n = 0;
  return shots.map((shot) => {
    if (shot.status === "deleted") {
      return <DeletedMarker key={shot.id} kind="shot" />;
    }
    n += 1;
    return <ShotRow key={shot.id} shot={shot} number={n} names={names} />;
  });
}

function ShotRow({
  shot,
  number,
  names,
}: {
  shot: LabelShot;
  number: number;
  names: SideNames;
}) {
  const added = shot.status === "added";
  return (
    <div
      data-row="shot"
      data-shot-id={shot.id}
      className={cn(
        SHOT_GRID,
        "min-h-[44px] text-[13px] text-[var(--ink-900)]",
        added && "rounded-[var(--radius-element)]",
      )}
      style={
        added
          ? {
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--blue) 35%, transparent)",
              background: "color-mix(in srgb, var(--blue) 3%, transparent)",
            }
          : undefined
      }
    >
      <span className="tabular text-[var(--ink-600)]">{number}</span>
      <Cell>
        {shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null}
      </Cell>
      <Cell>{sideLabel(shot.hitter, names)}</Cell>
      <Cell>{shot.stroke ? STROKE_LABEL[shot.stroke] : null}</Cell>
      <Cell>{shot.result ? RESULT_LABEL[shot.result] : null}</Cell>
      <Cell>{formatCourtPoint(shot.contactX, shot.contactY)}</Cell>
      <Cell>{formatCourtPoint(shot.landingX, shot.landingY)}</Cell>
      <span className="flex min-w-0 items-center">
        {added ? (
          <StatePill>Added</StatePill>
        ) : shot.status === "edited" ? (
          <StatePill>Edited</StatePill>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A tombstone: a thin red rule carrying a small pill. Static in T5 — T7 makes
 * the pill a button that opens the struck-through row with Undo.
 */
function DeletedMarker({ kind }: { kind: "point" | "shot" }) {
  const label = kind === "point" ? "Deleted point" : "Deleted shot";
  return (
    <div
      data-row={kind === "point" ? "deleted-point" : "deleted-shot"}
      className={cn(
        "flex h-7 items-center gap-2",
        kind === "shot" ? "pr-4 pl-11" : "",
      )}
    >
      <span
        className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap text-[var(--danger-hover)]"
        style={{
          background: "color-mix(in srgb, var(--danger) 8%, transparent)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--danger) 25%, transparent)",
        }}
      >
        {label}
      </span>
      <span
        className="h-px flex-1"
        style={{
          background: "color-mix(in srgb, var(--danger) 35%, transparent)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}

/** Checked (✓) once `checked_at` is set; "To check" until then. */
function PointStatus({ checked }: { checked: boolean }) {
  return checked ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-[var(--ink-700)]">
      <Check
        className="size-[13px] text-[var(--ink-900)]"
        strokeWidth={2}
        aria-hidden="true"
      />
      Checked
    </span>
  ) : (
    <span className="text-[12px] whitespace-nowrap text-[var(--ink-400)]">
      To check
    </span>
  );
}

/** A seeded value the labeller does not decide here: muted ink. */
function Calculated({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular truncate text-[var(--ink-500)]">
      {children ?? <EmptyMark label="Not set" />}
    </span>
  );
}

/** A value the labeller owns: full ink, an em dash until it is set. */
function Labelled({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-[var(--ink-900)]">
      {children ?? <EmptyMark label="Not labelled" />}
    </span>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular truncate">
      {children ?? <EmptyMark label="Not set" />}
    </span>
  );
}

function sideLabel(side: LabelSide | null, names: SideNames): string | null {
  return side ? names[side] : null;
}
