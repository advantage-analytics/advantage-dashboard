"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  GripVertical,
  List,
  Maximize,
  Minimize,
  Minimize2,
  RectangleVertical,
} from "lucide-react";
import type {
  BoardAnchor,
  BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";
import {
  ANCHOR_LABEL,
  SETTLE_CLASS,
  useCornerDrag,
} from "@/components/dashboard/matches/match-detail/film/use-corner-drag";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { inertOutside, useRailWidth } from "./label-black-view";
import { parseDockMinimised } from "./label-dock-position";
import {
  DEFAULT_FILM_COURT_ANCHOR,
  FILM_COURT_ANCHOR_STORAGE_KEY,
  FILM_COURT_HIDDEN_STORAGE_KEY,
  FILM_COURT_SIZE,
  FILM_RAIL_HIDDEN_STORAGE_KEY,
  filmCourtInsets,
  filmCourtRest,
  filmTransportInset,
  type FilmRailLayout,
} from "./label-film-position";
import { LabelRailResize } from "./label-rail-resize";
import {
  WHOLE_SCREEN_COPY,
  type BrowserFullscreenControl,
} from "./use-browser-fullscreen";

/**
 * The console's film full-screen view (board 08n) — the layout the Layout
 * menu calls "Film full screen": the video fills the screen edge to edge, as
 * the match Video tab's full screen does, and every piece of chrome is laid
 * over the picture — the points rail down the right, the court as a floating
 * card top-left, the transport on the film's foot.
 *
 * It is the black view's own mechanism (`label-black-view.tsx`): the same
 * `fixed inset-0 z-50` layer inside the console's root (not a portal, so
 * `--film-t` reaches the rows and the menus, confirm and tooltips that portal
 * to `body` paint above it), the page's chrome made `inert` while it is
 * mounted (`inertOutside`), and the same rail at the same remembered width
 * (`useRailWidth`, `RAIL_WIDTH_STORAGE_KEY`). What differs is only where the
 * pieces sit, which is this file.
 *
 * ── The layers ──────────────────────────────────────────────────────────────
 *
 * In DOM order, so each later one paints over the earlier: the film (the
 * shared `LabelVideoPlayer` with `fill`: `object-contain` on black, never
 * cropped, its transport on its foot stopping `filmTransportInset` short of
 * the right edge so the rail never covers it); the room's top scrim, so the
 * pills and the card's header read over a bright first frame; the court
 * card; the rail, flush to the right edge top to bottom (board 08n's screen
 * B) with a left hairline only. The rail's handle hangs 4px outside its left
 * edge, so the `<aside>` itself never clips — the clipped box is the one
 * inside.
 *
 * ── The court card ──────────────────────────────────────────────────────────
 *
 * `FilmCourtCard`: the overlay court's movement (`useCornerDrag`, the film
 * room's one mechanic) under a storage key of its own, resting by
 * `filmCourtRest` — top-left by default, dragged to any corner, clear of the
 * rail at its current width and of the transport. Its header is the drag
 * handle; a double-click on it is the way back to the default corner. It is
 * its own component because the hook measures the element it is given, and
 * the card unmounts while hidden.
 *
 * ── Hide and show ───────────────────────────────────────────────────────────
 *
 * The rail's header gains "Hide the points list" and the card's header "Hide
 * the court"; hidden, each leaves a pill in its corner — "Points · n / N"
 * top-right (with the browser's own full screen and the way out beside it,
 * since the rail's header went with the rail) and "Court" top-left — that brings it back. Both are remembered per
 * browser (`FILM_RAIL_HIDDEN_STORAGE_KEY`, `FILM_COURT_HIDDEN_STORAGE_KEY`),
 * read after mount as every stored choice here is. Focus follows a press
 * across the swap, as the overlay court's minimise does.
 */

/** The frame's `.ov-pill`: the film room's return-pill recipe, with a glyph. */
const PILL =
  "inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white/90 transition-colors duration-200 hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** The frame's `.ov-cx`, and the rail header's own icon-button recipe. */
const CARD_BUTTON =
  "flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/45 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** The court card: the frame's `rgba(13,13,13,0.86)` ground, hairline and drop. */
const PANEL =
  "rounded-[14px] bg-[rgba(13,13,13,0.86)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_18px_44px_rgba(0,0,0,0.35)]";

/** The flush rail (screen B): the same ground, a left hairline and nothing else. */
const RAIL_PANEL =
  "bg-[rgba(13,13,13,0.86)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]";

/** The film room's top wash (`film-fullscreen.tsx` `TOP_SCRIM`), at 180px. */
const TOP_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0) 100%)";

/** What the court card's header needs to be the drag handle. */
export interface FilmCourtHandle {
  headerProps: ComponentPropsWithoutRef<"div"> & {
    "data-court-handle": string;
  };
  headerClassName: string;
  headerTrailing: ReactNode;
}

/** A stored hidden state, read after mount; a spec pins it with the prop. */
function useHidden(
  storageKey: string,
  initial: boolean | undefined,
): [boolean, (next: boolean) => void] {
  const [hidden, setHidden] = useState(initial ?? false);
  useEffect(() => {
    if (initial !== undefined) return;
    try {
      const stored = localStorage.getItem(storageKey);
      // Storage is the external system here, readable only after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setHidden(parseDockMinimised(stored));
    } catch {
      /* storage blocked — it just starts shown */
    }
  }, [storageKey, initial]);
  const remember = useCallback(
    (next: boolean) => {
      setHidden(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* private window — the state just isn't kept */
      }
    },
    [storageKey],
  );
  return [hidden, remember];
}

export function LabelFilmView({
  initialRailWidth,
  initialRailHidden,
  initialCourtHidden,
  checked,
  total,
  onExit,
  wholeScreen,
  video,
  court,
  placing = false,
  rail,
}: {
  /** The rail's width on first render, in px — for specs. */
  initialRailWidth?: number;
  /** The rail tucked away on first render — for specs. Else from storage. */
  initialRailHidden?: boolean;
  /** The court tucked away on first render — for specs. Else from storage. */
  initialCourtHidden?: boolean;
  /** `labelProgress(points)`, for the "Points" pill. */
  checked: number;
  total: number;
  /** Back to the layout the console was in before this one. */
  onExit: () => void;
  /**
   * The browser's own full screen (`useBrowserFullscreen`), for the pill
   * beside the exit while the rail is hidden. Not supported: no pill.
   */
  wholeScreen?: BrowserFullscreenControl;
  /** The shared `LabelVideoPlayer`, with `fill` and this transport inset. */
  video: (transportInset: number) => ReactNode;
  /** The shared `LabelCourtPanel`, with `fill` and this header as its handle. */
  court: (handle: FilmCourtHandle) => ReactNode;
  /** A stroke is selected and a court click would write: the card's outline. */
  placing?: boolean;
  /** The rail's contents — `LabelBlackRail`, given its hide button. */
  rail: (hide: {
    onHide: () => void;
    hideButtonRef: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
}) {
  const { railWidth, resizeRail, resetRail } = useRailWidth(initialRailWidth);
  const [railHidden, setRailHidden] = useHidden(
    FILM_RAIL_HIDDEN_STORAGE_KEY,
    initialRailHidden,
  );
  const [courtHidden, setCourtHidden] = useHidden(
    FILM_COURT_HIDDEN_STORAGE_KEY,
    initialCourtHidden,
  );
  const railLayout: FilmRailLayout = { width: railWidth, hidden: railHidden };

  // Focus follows a press across the swap — hide button to pill and back —
  // and never moves on load. The rail's hide button is inside the rail.
  const railHideButton = useRef<HTMLButtonElement | null>(null);
  const railPill = useRef<HTMLButtonElement | null>(null);
  const courtHideButton = useRef<HTMLButtonElement | null>(null);
  const courtPill = useRef<HTMLButtonElement | null>(null);
  const handOff = useRef<"rail" | "court" | null>(null);
  useEffect(() => {
    const which = handOff.current;
    if (!which) return;
    handOff.current = null;
    if (which === "rail") {
      (railHidden ? railPill : railHideButton).current?.focus();
    } else {
      (courtHidden ? courtPill : courtHideButton).current?.focus();
    }
  }, [railHidden, courtHidden]);
  const hideRail = useCallback(() => {
    handOff.current = "rail";
    setRailHidden(true);
  }, [setRailHidden]);
  const showRail = useCallback(() => {
    handOff.current = "rail";
    setRailHidden(false);
  }, [setRailHidden]);
  const hideCourt = useCallback(() => {
    handOff.current = "court";
    setCourtHidden(true);
  }, [setCourtHidden]);
  const showCourt = useCallback(() => {
    handOff.current = "court";
    setCourtHidden(false);
  }, [setCourtHidden]);

  return (
    <TooltipProvider>
      <div
        ref={inertOutside}
        data-label-film=""
        className="fixed inset-0 z-50 bg-black text-white"
      >
        {/* The film, the whole layer: the frame is `absolute inset-0`
            (`fill`), the picture contained on black. */}
        <div data-label-film-video="" className="absolute inset-0">
          {video(filmTransportInset(railWidth, railHidden))}
        </div>

        {/* The room's top wash: not operable, never takes the pointer. */}
        <div
          aria-hidden="true"
          data-label-film-scrim=""
          className="pointer-events-none absolute inset-x-0 top-0 h-[180px]"
          style={{ background: TOP_SCRIM }}
        />

        {courtHidden ? (
          <ChromeTooltip label="Show the court" side="bottom" align="start">
            <button
              type="button"
              ref={courtPill}
              data-label-film-court-pill=""
              aria-label="Show the court"
              onClick={showCourt}
              className={cn(PILL, "absolute top-[18px] left-6")}
            >
              <RectangleVertical
                className="size-3 text-white/60"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              Court
            </button>
          </ChromeTooltip>
        ) : (
          <FilmCourtCard
            rail={railLayout}
            placing={placing}
            hideButtonRef={courtHideButton}
            onHide={hideCourt}
          >
            {court}
          </FilmCourtCard>
        )}

        {railHidden ? (
          // The list's pill, and the way out beside it: the rail's own exit
          // went with the rail.
          <div
            data-label-film-rail-pills=""
            className="absolute top-[18px] right-6 flex items-center gap-2"
          >
            <ChromeTooltip label="Show the points list" side="bottom">
              <button
                type="button"
                ref={railPill}
                data-label-film-rail-pill=""
                onClick={showRail}
                className={PILL}
              >
                <List
                  className="size-3 text-white/60"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span className="tabular">
                  Points · {checked} / {total}
                </span>
              </button>
            </ChromeTooltip>
            {wholeScreen?.supported ? (
              <ChromeTooltip
                label={
                  wholeScreen.active
                    ? WHOLE_SCREEN_COPY.leave
                    : WHOLE_SCREEN_COPY.enter
                }
                detail={WHOLE_SCREEN_COPY.detail}
                side="bottom"
                align="end"
              >
                <button
                  type="button"
                  data-label-whole-screen=""
                  aria-label={
                    wholeScreen.active
                      ? WHOLE_SCREEN_COPY.leave
                      : WHOLE_SCREEN_COPY.enter
                  }
                  aria-pressed={wholeScreen.active}
                  onClick={wholeScreen.toggle}
                  className={cn(PILL, "px-2")}
                >
                  {wholeScreen.active ? (
                    <Minimize
                      className="size-3.5 text-white/80"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  ) : (
                    <Maximize
                      className="size-3.5 text-white/80"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </ChromeTooltip>
            ) : null}
            <ChromeTooltip label="Exit full screen" side="bottom" align="end">
              <button
                type="button"
                data-label-film-exit=""
                aria-label="Exit full screen"
                onClick={onExit}
                className={cn(PILL, "px-2")}
              >
                <Minimize2
                  className="size-3.5 text-white/80"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>
          </div>
        ) : (
          // The rail, flush to the right edge top to bottom (screen B) on
          // the translucent ground with a left hairline only. `absolute` is
          // its own containing block, so the handle hangs 4px outside its
          // left edge unclipped; the clipped box is the one inside.
          <aside
            data-label-rail=""
            aria-label="Points"
            className={cn(
              RAIL_PANEL,
              "absolute inset-y-0 right-0 flex flex-col",
            )}
            style={{ width: railWidth }}
          >
            <LabelRailResize
              width={railWidth}
              onResize={resizeRail}
              onReset={resetRail}
            />
            <div
              data-label-film-rail-box=""
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {rail({ onHide: hideRail, hideButtonRef: railHideButton })}
            </div>
          </aside>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * The court card over the film: the overlay court's shell (`label-court-dock.tsx`)
 * at board 08n's size and ground, on its own corner key. The panel inside is
 * the console's, handed the header that moves it.
 */
function FilmCourtCard({
  rail,
  placing,
  hideButtonRef,
  onHide,
  children,
}: {
  rail: FilmRailLayout;
  placing: boolean;
  hideButtonRef: RefObject<HTMLButtonElement | null>;
  onHide: () => void;
  children: (handle: FilmCourtHandle) => ReactNode;
}) {
  // A new `rest` whenever the rail moves or hides: the hook reads it every
  // render, so a card in a right corner steps clear as the rail widens.
  const rest = useCallback(
    (at: BoardAnchor | null, size: BoardSize, room: BoardSize) =>
      filmCourtRest(at, size, room, rail),
    [rail],
  );
  const announce = useCallback(
    (at: BoardAnchor) => `Court in the ${ANCHOR_LABEL[at]} corner.`,
    [],
  );
  const insets = filmCourtInsets(rail);
  const move = useCornerDrag({
    storageKey: FILM_COURT_ANCHOR_STORAGE_KEY,
    defaultAnchor: DEFAULT_FILM_COURT_ANCHOR,
    rest,
    fallback: { left: insets.left, top: insets.top },
    announce,
    insets,
  });
  const { ghost, position, sizes } = move;
  // The stored corner only once measured: the server and the first client
  // render must agree, and only the client can read storage.
  const anchor = sizes
    ? (move.anchor ?? DEFAULT_FILM_COURT_ANCHOR)
    : DEFAULT_FILM_COURT_ANCHOR;

  return (
    <>
      {ghost && (
        <div
          aria-hidden="true"
          data-film-court-ghost=""
          className={cn(
            "absolute rounded-[14px] border border-dashed border-white/40",
            SETTLE_CLASS,
          )}
          style={{ left: ghost.left, top: ghost.top, ...FILM_COURT_SIZE }}
        />
      )}
      <div
        {...move.containerProps}
        role="group"
        aria-label="Court"
        aria-describedby="label-film-court-hint"
        data-label-film-court=""
        data-dock-anchor={anchor}
        data-court-placing={placing ? "true" : "false"}
        data-dock-lifted={move.free ? "true" : undefined}
        className={cn(
          PANEL,
          "absolute flex flex-col px-3 pt-3 pb-2.5 transition-[scale,box-shadow] ease-[var(--ease-out-expo)] outline-none focus-visible:shadow-[var(--focus-ring)] motion-reduce:scale-100",
          // Hidden until measured, so a remembered corner never flies in.
          !sizes && "invisible",
          !move.free && move.placed && SETTLE_CLASS,
          move.free
            ? "scale-[1.015] duration-[120ms]"
            : placing
              ? "scale-100 shadow-[0_0_0_1.5px_var(--blue),0_18px_44px_rgba(0,0,0,0.35)] duration-150"
              : "scale-100 duration-150",
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: position.left, top: position.top, ...FILM_COURT_SIZE }}
      >
        <span id="label-film-court-hint" className="sr-only">
          Drag the top of the card to move the court, or press the arrow keys to
          nudge it 8 pixels at a time — 40 with Shift. Space picks it up and
          drops it into the nearest corner; Escape cancels the move.
          Double-click the top of the card to put it back in the top left.
        </span>
        <span aria-live="polite" className="sr-only">
          {move.announcement && (
            <span key={move.announcement.seq}>{move.announcement.text}</span>
          )}
        </span>
        {children({
          // The header is the drag handle. A press on the hide button is that
          // button's: capturing the pointer here would move the click off it.
          headerProps: {
            ...move.handleProps,
            "data-court-handle": "",
            onPointerDown: (e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              move.handleProps.onPointerDown(e);
            },
            onDoubleClick: (e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              move.reset();
            },
          },
          headerClassName: cn(
            "touch-none select-none",
            move.free ? "cursor-grabbing" : "cursor-grab",
          ),
          headerTrailing: (
            <span className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
              <GripVertical
                className="size-3.5 text-white/45"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <ChromeTooltip label="Hide the court" side="bottom" align="end">
                <button
                  type="button"
                  ref={hideButtonRef}
                  data-label-film-court-hide=""
                  aria-label="Hide the court"
                  onClick={onHide}
                  className={CARD_BUTTON}
                >
                  <Minimize2
                    className="size-3.5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </button>
              </ChromeTooltip>
            </span>
          ),
        })}
      </div>
    </>
  );
}
