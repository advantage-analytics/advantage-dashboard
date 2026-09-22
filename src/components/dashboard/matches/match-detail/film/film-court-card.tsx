"use client";

import { Layers, X } from "lucide-react";
import { useState } from "react";

import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { cn } from "@/lib/utils";

import { OPP, OUT, YOU, readoutPlacement, type CourtMark } from "./film-court";
import { UNMEASURED, shotLabel, shotRowCells } from "./film-shots";

/**
 * The mini court over the film (handoff H2 §C2, frame `C2-FilmCourt.html`).
 *
 * ── Why this file is not `film-court.tsx` ───────────────────────────────────
 *
 * The spec pairs `FilmCourt` with the pure `film-court.ts` and names this file
 * `film-court.tsx`. That pair cannot ship: `film-court` would be the repo's
 * only `.ts`/`.tsx` basename collision, and the two toolchains break the tie in
 * OPPOSITE directions. TypeScript tries `.ts` first, so
 * `import { FilmCourt } from "./film-court"` fails to typecheck — the
 * component would be unimportable. Next resolves `.tsx` first
 * (`resolveExtensions`, and webpack-config.js's own list), so the import below
 * would resolve this file to ITSELF and `YOU` / `OPP` / `OUT` would not exist
 * at link time. Renaming the new file is the only fix that leaves T1's landed
 * module, the tsconfig and `next.config.ts` alone. The exported component is
 * still `FilmCourt`, which is what every call site names.
 *
 * Presentational and nothing else: it fetches no data, reads no context and
 * never asks who "you" is — `FilmRoom` owns the store, maps the shots through
 * the pure `film-court.ts` geometry and passes the marks and the two names
 * down (guardrails §4). This file only draws them.
 *
 * It is a READOUT, not a control. It is a sibling of the `<video>`, never a
 * child, so a click on a mark cannot reach the film underneath and no
 * `stopPropagation` is needed; the board is the only thing in the room that
 * moves, and the points drawer never displaces this card. Unlike the board it
 * carries no drag affordance at all. Every mark is a seek target and is
 * keyboard-reachable in shot order, which the DOM order of the buttons gives.
 *
 * Point mode is the rally as it happens — a donut where the ball was struck,
 * a filled dot where it landed, both fading out two shots later. Match mode
 * plots bounces only, smaller and flat. `none` is the between-points state:
 * the lines stay, the marks go, and the card says so in words rather than
 * vanishing (R7 — it is not an empty state and does not animate out).
 */

/** The three things the card can be showing. */
export type FilmCourtMode = "point" | "match" | "none";

/**
 * Point-mode marks belong to the point already playing; match-mode marks carry
 * the point they came from, which is what `onSelectMark` seeks into.
 */
export type FilmCourtMark = CourtMark & { pointId?: string };

export interface FilmCourtProps {
  mode: FilmCourtMode;
  /** Ignored under `mode="none"`, which names itself. */
  title: string;
  caption: string;
  /** Drawn in the order given — the order the shots were hit. */
  marks: readonly FilmCourtMark[];
  youName: string;
  opponentName: string;
  /** False while the chrome is collapsed: the header glyphs go, the card stays. */
  controls: boolean;
  onSwapMode: () => void;
  onHide: () => void;
  onSelectMark: (mark: FilmCourtMark) => void;
  /**
   * Anything that draws inside the court box on top of the lines and the
   * marks, under the readout. Nothing fills it today — the moving ball that
   * did was removed (author decision, 2026-09-22) — and the slot is kept
   * because the card knows nothing about what goes in it: it takes an element
   * already built, so this file gains no clock, no paths and no second
   * geometry. Absent, the box's markup is exactly what it was.
   */
  overlay?: React.ReactNode;
  /**
   * Anything that changes whenever the film seeks. An open readout describes a
   * moment, so it closes the instant the film moves to another one.
   */
  seekKey: number | string;
  /**
   * Which side of the room this card is docked on, straight through to
   * {@link readoutPlacement}. Absent in point mode, where the card sits
   * centred and the mark's own half decides the readout's side.
   */
  dock?: "left" | "right";
}

/**
 * The frame's own easing on the fade OUT. `markOpacity` steps a mark's opacity
 * in 0.05s as the film time passes; this smooths those steps into the
 * continuous 2 s hold / 2.5 s fade the court is meant to read as.
 */
const MARK_FADE_TRANSITION = "opacity 300ms cubic-bezier(.25,.46,.45,.94)";
/**
 * The fade IN, on the mark's own mount (author decision, 2026-09-22): marks
 * used to pop into existence at full opacity. `film-mark-in` (`globals.css`)
 * has no `to`, so it rises from 0 to the element's own inline opacity and then
 * hands the element back to `MARK_FADE_TRANSITION`. Point mode only — in match
 * mode the whole rally is drawn at once, where 150ms of per-mark entrance
 * would read as a flicker rather than as a stroke landing.
 */
const MARK_IN_ANIMATION =
  "film-mark-in var(--duration-fast) var(--ease-primary) both";
/** The live bounce's ring. */
const RING = "0 0 0 1px rgba(255,255,255,0.85)";

const LINE = "rgba(255,255,255,0.24)";
const OUTER_LINE = "rgba(255,255,255,0.34)";
const NET_LINE = "rgba(255,255,255,0.6)";
const SURFACE = "rgba(214,228,249,0.07)";

const MUTED = "rgba(255,255,255,0.6)";
const READOUT_LINE = "rgba(255,255,255,0.64)";

const COURT_W = 152;
const COURT_H = 227;

/**
 * The card's drawn box. `courtSlot` (`board-position.ts`) places the card in
 * the board's column, and for a bottom corner it needs the card's height
 * BEFORE the card exists — so the height is pinned on the section below rather
 * than left to the content, and the room positions from this constant instead
 * of measuring. 168 is the frame's width; the height is 8 padding + the 20px
 * header + 7 + the 227px court + 7 + the legend row + 8 padding.
 */
export const FILM_COURT_SIZE = { width: 168, height: 296 } as const;
/** The readout clears the 152px box by 18px on whichever side it hangs. */
const READOUT_GAP = COURT_W + 18;

const colourOf = (mark: FilmCourtMark) =>
  mark.role === "out" ? OUT : mark.role === "you" ? YOU : OPP;

/** One mark is at most one contact and one bounce, so this is unique. */
const keyOf = (mark: FilmCourtMark) => `${mark.shotId}:${mark.kind}`;

/**
 * The readout's three lines, built from the shot's own fields through the
 * same helpers the "Current point" widget uses — so an unmeasured speed,
 * placement or result prints {@link UNMEASURED} and never a `0`, which would
 * be a different claim about the match.
 */
function readoutLines(mark: FilmCourtMark, playerName: string) {
  const cells = shotRowCells(mark.shot, mark.order, playerName);
  const speed = cells.mph === UNMEASURED ? UNMEASURED : `${cells.mph} mph`;
  return {
    title: `${shotLabel(mark.shot)} · ${speed}`,
    who: `${cells.player} · shot ${mark.order} of ${mark.rallyShots}`,
    where: `${cells.placement} · ${cells.result.toLowerCase()}`,
  };
}

/** A court line: everything but the marks and the readout. */
function Line({ style }: { style: React.CSSProperties }) {
  return <div aria-hidden="true" className="absolute" style={style} />;
}

function LegendKey({
  label,
  background,
  border,
}: {
  label: string;
  background: string;
  border?: string;
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1 truncate"
      style={{ fontSize: 9.5, color: MUTED }}
    >
      <span
        aria-hidden="true"
        className="box-border shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: "var(--radius-pill)",
          background,
          border,
        }}
      />
      {label}
    </span>
  );
}

/**
 * A 20px header glyph. Under a collapsed chrome both of them go to opacity 0
 * and out of the tab order, and the card keeps its box — nothing reflows.
 */
function HeaderButton({
  label,
  hidden,
  onClick,
  children,
}: {
  label: string;
  hidden: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={onClick}
      className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] transition-opacity duration-200 hover:bg-white/[0.08]"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      {children}
    </button>
  );
}

export function FilmCourt({
  mode,
  title,
  caption,
  marks,
  youName,
  opponentName,
  controls,
  onSwapMode,
  onHide,
  onSelectMark,
  overlay,
  seekKey,
  dock,
}: FilmCourtProps) {
  // One readout at a time — and the open one remembers the seek it belongs
  // to. A seek moves the film to another moment, so whatever the readout was
  // explaining is no longer on screen: the moment `seekKey` changes the stored
  // key stops matching and the readout is gone. Derived rather than cleared in
  // an effect, which would set state on every seek and cascade a second render
  // four times a second while the film runs.
  const [opened, setOpened] = useState<{
    key: string;
    seekKey: FilmCourtProps["seekKey"];
  } | null>(null);
  const openKey = opened && opened.seekKey === seekKey ? opened.key : null;
  const show = (key: string) => setOpened({ key, seekKey });

  const drawn = mode === "none" ? [] : marks;
  const heading = mode === "none" ? "Next point" : title;
  const footNote = mode === "none" ? "Not started" : caption;
  const isMatch = mode === "match";
  const hidden = controls === false;
  const size = isMatch ? 4.5 : 7;

  const open = drawn.find((mark) => keyOf(mark) === openKey) ?? null;
  const openLines = open
    ? readoutLines(open, open.hitter === "you" ? youName : opponentName)
    : null;
  const openAt = open ? readoutPlacement(open.x, open.y, dock) : null;

  return (
    <section
      aria-label="Shot placement"
      className="box-border flex flex-col items-center"
      style={{
        width: FILM_COURT_SIZE.width,
        height: FILM_COURT_SIZE.height,
        gap: 7,
        padding: 8,
        borderRadius: "var(--radius-element)",
        background: "rgba(13,13,13,0.8)",
        boxShadow: "var(--shadow-dropdown)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        className="flex w-full items-center"
        style={{ height: 20, gap: 4, paddingLeft: 2 }}
      >
        <span
          className="min-w-0 truncate"
          style={{ fontSize: 10.5, fontWeight: 500, color: "#FFFFFF" }}
        >
          {heading}
        </span>
        <div className="flex-1" />
        <HeaderButton
          label={isMatch ? "Show this point only" : "Show the whole match"}
          hidden={hidden}
          onClick={onSwapMode}
        >
          <Layers
            aria-hidden="true"
            strokeWidth={1.6}
            style={{ width: 11, height: 11, color: "rgba(255,255,255,0.7)" }}
          />
        </HeaderButton>
        <HeaderButton label="Hide the court" hidden={hidden} onClick={onHide}>
          <X
            aria-hidden="true"
            strokeWidth={1.6}
            style={{ width: 11, height: 11, color: "rgba(255,255,255,0.7)" }}
          />
        </HeaderButton>
      </div>

      {/* `shrink-0`: the card's height is pinned (see FILM_COURT_SIZE), so the
          court box must never be the thing that gives if the rows around it
          measure a pixel taller than the constant allows for. */}
      <div
        className="relative shrink-0"
        style={{ width: COURT_W, height: COURT_H }}
      >
        {/* The doubles court, then the singles tramlines, the two service
            boxes and their centre line, and the net across the middle. */}
        <Line
          style={{
            left: "6%",
            right: "6%",
            top: "3%",
            bottom: "3%",
            border: `1px solid ${OUTER_LINE}`,
            background: SURFACE,
          }}
        />
        <Line
          style={{
            left: "17%",
            top: "3%",
            bottom: "3%",
            width: 1,
            background: LINE,
          }}
        />
        <Line
          style={{
            left: "83%",
            top: "3%",
            bottom: "3%",
            width: 1,
            background: LINE,
          }}
        />
        <Line
          style={{
            left: "17%",
            right: "17%",
            top: "24.7%",
            height: 1,
            background: LINE,
          }}
        />
        <Line
          style={{
            left: "17%",
            right: "17%",
            top: "75.3%",
            height: 1,
            background: LINE,
          }}
        />
        <Line
          style={{
            left: "50%",
            top: "24.7%",
            height: "50.6%",
            width: 1,
            background: LINE,
          }}
        />
        <Line
          style={{
            left: "2%",
            right: "2%",
            top: "50%",
            height: 1,
            background: NET_LINE,
          }}
        />

        {drawn.map((mark) => {
          const colour = colourOf(mark);
          const contact = mark.kind === "contact";
          const lines = readoutLines(
            mark,
            mark.hitter === "you" ? youName : opponentName,
          );
          return (
            <button
              key={keyOf(mark)}
              type="button"
              data-shot-id={mark.shotId}
              aria-label={`${lines.title} · ${lines.who} · ${lines.where} — ${mark.kind}`}
              onPointerEnter={() => show(keyOf(mark))}
              onPointerLeave={() => setOpened(null)}
              onFocus={() => show(keyOf(mark))}
              onBlur={() => setOpened(null)}
              onClick={() => onSelectMark(mark)}
              className="absolute box-border cursor-pointer"
              style={{
                left: `${mark.x}%`,
                top: `${mark.y}%`,
                width: size,
                height: size,
                opacity: mark.opacity,
                transform: "translate(-50%,-50%)",
                borderRadius: "var(--radius-pill)",
                // A contact is the hollow donut, a bounce the filled dot.
                border: !isMatch && contact ? `1px solid ${colour}` : undefined,
                background: contact && !isMatch ? "transparent" : colour,
                boxShadow: mark.live && !isMatch ? RING : undefined,
                transition: MARK_FADE_TRANSITION,
                animation: isMatch ? undefined : MARK_IN_ANIMATION,
              }}
            />
          );
        })}

        {overlay}

        {open && openLines && openAt ? (
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none absolute z-[3] flex flex-col whitespace-nowrap",
              DARK_READOUT_CLASS,
            )}
            style={{
              width: 168,
              gap: 3,
              padding: "10px 12px",
              top: `${openAt.top}%`,
              left: openAt.side === "right" ? READOUT_GAP : undefined,
              right: openAt.side === "left" ? READOUT_GAP : undefined,
              ...DARK_READOUT_STYLE,
            }}
          >
            <span
              className="truncate"
              style={{ fontSize: 12, fontWeight: 500, color: "#FFFFFF" }}
            >
              {openLines.title}
            </span>
            <span
              className="truncate"
              style={{ fontSize: 11, color: READOUT_LINE }}
            >
              {openLines.who}
            </span>
            <span
              className="truncate"
              style={{ fontSize: 11, color: READOUT_LINE }}
            >
              {openLines.where}
            </span>
          </div>
        ) : null}
      </div>

      <div
        className="flex w-full items-center"
        style={{ gap: 8, padding: "1px 2px 0" }}
      >
        {isMatch ? (
          <>
            <LegendKey label={youName} background={YOU} />
            <LegendKey label={opponentName} background={OPP} />
          </>
        ) : (
          <>
            <LegendKey
              label="Contact"
              background="transparent"
              border="1px solid rgba(255,255,255,0.65)"
            />
            <LegendKey label="Bounce" background="rgba(255,255,255,0.75)" />
          </>
        )}
        <div className="flex-1" />
        <span
          className="mono tabular shrink-0"
          style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}
        >
          {footNote}
        </span>
      </div>
    </section>
  );
}
