"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MoveVertical } from "lucide-react";

import {
  contactReadout,
  COURT_HALF_FT,
  schemeLabel,
  type BandSettings,
} from "@/lib/data/viz-bands";
import {
  formatDistance,
  formatDistanceValue,
  FT_PER_M,
  type DistanceUnit,
} from "@/lib/format/distance";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import {
  bandEditorBounds,
  bandEditorDirty,
  bandEditorDraftScheme,
  nudgeDivider,
  setDivider,
  type BandEditorContext,
  type BandEditorKind,
  type BandEditorState,
} from "./band-editor-state";
import { LINE_COLOR } from "./court-art";
import {
  VIEWER_COURT,
  viewerBandLayerY,
  viewerScreenPxToFt,
} from "./court-geometry";

/**
 * The depth/contact band editor inside the fullscreen viewer (Phase 2B, Task
 * 4; spec Appendix P2m/P2p). ONE editor for both kinds — `state.kind` is
 * `"depth"` (return landings, the far half) or `"contact"` (return/rally
 * contact, the near half) — drawn in three places, because it lives in three
 * places on screen:
 *
 * - `VizBandsEditorHandles`: the two dividers, inside the court's pan layer;
 * - `VizBandsEditorBanner`: the instruction banner under the top pill row;
 * - `VizBandsEditorSlab`: what the bottom slab crossfades to.
 *
 * All three are driven by the one `BandEditorState` the viewer holds
 * (`viz-fullscreen.tsx`), and every decision about where a divider may go is
 * `band-editor-state.ts`'s. Nothing here writes: Save hands the reducer's
 * payload to `useVizBands().applyBands`, the same optimistic, sequenced path
 * a preset pick takes, and never calls the server action itself.
 *
 * ## Screen pixels → feet
 *
 * The rules are written in screen px — ↑/↓ move 2 px (⇧ 10 px), the two
 * dividers keep 26 px apart — and converted to feet at the CURRENT zoom
 * through `viewerScreenPxToFt` (one viewBox unit is `(artPx.h · z) /
 * viewBox.h` px). The court is locked while editing (`usePanZoom`'s
 * `locked`), so `z` does not change under a drag.
 */

/** P2m: the dividers never come closer than this on screen. */
const MIN_GAP_PX = 26;
/** P2m: ↑/↓ step, and the ⇧ step. */
const KEY_STEP_PX = 2;
const KEY_STEP_SHIFT_PX = 10;
/** P2m: the handle's hit area, centred on the line. */
const HIT_PX = 22;

/** The banner's text, which the handles also point at with
 *  `aria-describedby` — a screen-reader user landing on a divider hears how
 *  to move it. There is only ever one viewer, so a fixed id is safe. */
const EDITOR_HINT_ID = "viz-bands-editor-hint";

const DIVIDER_LABELS: Record<BandEditorKind, [string, string]> = {
  depth: ["Divider between Deep and Mid", "Divider between Mid and Short"],
  // P2o names the three contact bands INSIDE / ON BASELINE / BEHIND.
  contact: [
    "Divider between Inside and On baseline",
    "Divider between On baseline and Behind",
  ],
};

/** The chip on a divider and its `aria-valuetext` — the same string. */
function chipText(kind: BandEditorKind, unit: DistanceUnit, ft: number) {
  return kind === "depth" ? formatDistance(unit, ft) : contactReadout(unit, ft);
}

/** A slider number (feet) in the display unit, to one decimal. */
function ariaNumber(unit: DistanceUnit, ft: number): number {
  const value = unit === "ft" ? ft : ft / FT_PER_M;
  return Math.round(value * 10) / 10;
}

export function editorContext(
  unit: DistanceUnit,
  z: number,
): BandEditorContext {
  return { unit, minGapFt: viewerScreenPxToFt(MIN_GAP_PX, z) };
}

/* ── Handles ──────────────────────────────────────────────────────────── */

export function VizBandsEditorHandles({
  state,
  z,
  unit,
  update,
}: {
  state: BandEditorState;
  /** The (locked) zoom — for positioning and for px → ft. */
  z: number;
  unit: DistanceUnit;
  /** Functional update of the viewer's editor state. */
  update: (fn: (prev: BandEditorState) => BandEditorState) => void;
}) {
  const [held, setHeld] = useState<0 | 1 | null>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  /**
   * A drag replays from the state at POINTER-DOWN, not from the previous
   * frame: pushing the other divider out of the way and then backing off lets
   * it spring back, and the whole gesture is one clean function of how far
   * the pointer has travelled.
   */
  const dragRef = useRef<{
    index: 0 | 1;
    pointerId: number;
    startY: number;
    start: BandEditorState;
  } | null>(null);

  // Entering edit mode lands focus on the first divider. A frame late on
  // purpose: the bands menu that opened the editor is closing in the same
  // commit, and its own focus return must not win.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      firstRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const ctx = editorContext(unit, z);
  const [lo, hi] = bandEditorBounds(state.kind, unit);
  const width = VIEWER_COURT.artPx.w * z;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, index: 0 | 1) {
    if (e.button !== 0) return;
    // The court underneath must never see this press — the pan is locked
    // anyway, and the layer is `data-chrome`, but a divider drag is not a
    // pan gesture under any reading.
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      index,
      pointerId: e.pointerId,
      startY: e.clientY,
      start: state,
    };
    setHeld(index);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    // Feet grow DOWN the frame in both halves (`viewerBandFtFromY`), so the
    // screen delta and the feet delta share a sign.
    const deltaFt = viewerScreenPxToFt(e.clientY - drag.startY, z);
    const { start, index } = drag;
    update(() => setDivider(start, index, start.draft[index] + deltaFt, ctx));
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setHeld(null);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>, index: 0 | 1) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
      // Left/right would pan the court in the viewer; while editing they do
      // nothing at all, and they must not fall through to anything that
      // would.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // Spatial, like the drag: ↑ moves the line UP the screen (toward the far
    // baseline for depth, toward the net for contact), ↓ moves it down.
    const px = e.shiftKey ? KEY_STEP_SHIFT_PX : KEY_STEP_PX;
    const deltaFt = viewerScreenPxToFt(e.key === "ArrowDown" ? px : -px, z);
    update((prev) => nudgeDivider(prev, index, deltaFt, ctx));
  }

  return (
    <div data-chrome="" className="pointer-events-none absolute inset-0">
      {([0, 1] as const).map((index) => {
        const ft = state.draft[index];
        const y = viewerBandLayerY(state.kind, ft, z);
        const chip = chipText(state.kind, unit, ft);
        const isHeld = held === index;
        return (
          <div
            key={index}
            ref={index === 0 ? firstRef : undefined}
            role="slider"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={DIVIDER_LABELS[state.kind][index]}
            aria-describedby={EDITOR_HINT_ID}
            // In the DISPLAY unit, like the valuetext. valuenow is in
            // screen-up terms (mirrored), so ↑ raises it as ARIA expects;
            // the chip text is what is actually announced.
            aria-valuemin={ariaNumber(unit, lo)}
            aria-valuemax={ariaNumber(unit, hi)}
            aria-valuenow={ariaNumber(unit, lo + hi - ft)}
            aria-valuetext={chip}
            className="group pointer-events-auto absolute left-0 cursor-ns-resize outline-none"
            style={{
              top: y - HIT_PX / 2,
              width,
              height: HIT_PX,
              touchAction: "none",
            }}
            onPointerDown={(e) => onPointerDown(e, index)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {/* The line: 1px, 2px while held. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-[var(--blue)]"
              style={{ height: isHeld ? 2 : 1 }}
            />
            {/* The white square handle at the left end. */}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-[6px] size-[10px] -translate-y-1/2 border-[1.5px] border-[var(--blue)] bg-white group-focus-visible:shadow-[var(--focus-ring)]"
            />
            {/* The chip at the right end, riding the line. */}
            <span
              aria-hidden="true"
              className="mono tabular absolute top-1/2 right-[6px] -translate-y-1/2 rounded-full bg-[var(--blue)] px-1.5 text-[10px] leading-[16px] whitespace-nowrap group-focus-visible:shadow-[var(--focus-ring)]"
              style={{ color: LINE_COLOR }}
            >
              {chip}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Banner ───────────────────────────────────────────────────────────── */

/**
 * P2m/P2p: under the pill row, top-right. The arrows are in the TSX string,
 * never in CSS — Turbopack drops a CSS rule block that contains unicode.
 */
export function VizBandsEditorBanner({ kind }: { kind: BandEditorKind }) {
  const text =
    kind === "depth"
      ? "Editing depth bands — drag a divider, or focus one and use ↑↓."
      : "Editing contact bands — drag a line, or focus one and use ↑↓.";
  return (
    <div
      data-chrome=""
      className="absolute top-[50px] right-[18px] flex h-9 max-w-[calc(100%-36px)] items-center gap-2 rounded-[10px] px-3 backdrop-blur-[8px]"
      style={{ background: "rgba(13,13,13,0.82)" }}
    >
      <MoveVertical
        className="size-[13px] shrink-0 text-[var(--blue)]"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <p id={EDITOR_HINT_ID} className="truncate text-[12px] text-white">
        {text}{" "}
        <span style={{ color: "rgba(255,255,255,0.6)" }}>Esc cancels.</span>
      </p>
    </div>
  );
}

/* ── Slab ─────────────────────────────────────────────────────────────── */

/** "0–12 · 12–24 · 24–39 ft" (depth) / "at the line · 5 ft behind" (contact). */
function rangeSummary(state: BandEditorState, unit: DistanceUnit): string {
  const [a, b] = state.draft;
  if (state.kind === "contact") {
    return `${contactReadout(unit, a)} · ${contactReadout(unit, b)}`;
  }
  const n = (ft: number) => formatDistanceValue(unit, ft);
  return `${n(0)}–${n(a)} · ${n(a)}–${n(b)} · ${n(b)}–${n(COURT_HALF_FT)} ${unit}`;
}

/**
 * What the bottom slab crossfades to (P2m): "Depth bands" + mono scheme |
 * mono range summary … Reset · Cancel · Save bands. It fades IN over 200ms
 * (none under reduced motion); the viewer's own controls fade out underneath
 * it (`viz-fullscreen.tsx`).
 */
export function VizBandsEditorSlab({
  state,
  current,
  saving,
  unit,
  onReset,
  onCancel,
  onSave,
}: {
  state: BandEditorState;
  /** The LIVE effective bands — dirty is measured against them, so an
   *  in-flight save (whose optimistic override already equals the payload)
   *  reads as not dirty, and a failed one (reverted) reads as dirty again. */
  current: BandSettings;
  /** A save is in flight: Save is dead and busy. */
  saving: boolean;
  unit: DistanceUnit;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dirty = !saving && bandEditorDirty(state, current);
  const isDepth = state.kind === "depth";
  const textButton =
    "h-8 shrink-0 cursor-pointer rounded-[6px] px-2 text-[12px] font-medium text-white/85 transition-colors duration-200 hover:bg-white/10 hover:text-white motion-reduce:transition-none";

  return (
    <div
      role="group"
      aria-label={isDepth ? "Depth band editor" : "Contact band editor"}
      className="absolute inset-0 flex min-w-0 animate-in items-center gap-2 px-3 duration-200 fade-in-0 motion-reduce:animate-none"
    >
      <MoveVertical
        className="size-[13px] shrink-0 text-white/70"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <span className="shrink-0 text-[12px] font-medium text-white">
        {isDepth ? "Depth bands" : "Contact bands"}
      </span>
      {isDepth && (
        <span
          className="mono tabular shrink-0 text-[10px]"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {schemeLabel(bandEditorDraftScheme(state))}
        </span>
      )}
      <div aria-hidden="true" className="h-4 w-px shrink-0 bg-white/[0.18]" />
      <span
        className="mono tabular min-w-0 truncate text-[11px]"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        {rangeSummary(state, unit)}
      </span>
      <div className="flex-1" />
      <button type="button" onClick={onReset} className={textButton}>
        {isDepth ? "Reset to thirds" : "Reset to default"}
      </button>
      <button type="button" onClick={onCancel} className={textButton}>
        Cancel
      </button>
      <button
        type="button"
        aria-disabled={!dirty}
        aria-busy={saving || undefined}
        className={cn(
          advButton("primary", "sm"),
          // Dead: no pointer affordance and no hover change — it only looks
          // like the button it will become.
          !dirty && "cursor-default opacity-45 hover:bg-[var(--blue)]",
        )}
        onClick={() => {
          if (dirty) onSave();
        }}
      >
        Save bands
      </button>
    </div>
  );
}
