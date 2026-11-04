import {
  FILM_ROW_ACTION_TRANSITION,
  FILM_ROW_SLIDE_TRANSITION,
} from "./film-row-reveal";

/**
 * The point list's paint, per tone — the class tables `point-list.tsx` draws
 * its card, its game headers and its rows with, kept in a leaf of their own
 * so a surface that borrows the row's geometry can take the same strings
 * without pulling in the list's menus, drawer and scroll hooks.
 * `point-list.tsx` imports them from here and re-exports nothing else about
 * them.
 *
 * Since the "W-E chat" redesign (canvas "Folded list v2") the light tone is
 * the dark one's geometry in light inks: a card with no inner padding, rows
 * full-bleed on 14px sides with no radius, a 12px/500 title, an 11px mono
 * score — so the report column and the room draw one list, not two.
 */

/** Light is the in-report column; dark is the fullscreen room's drawer. */
export type FilmListTone = "light" | "dark";

/** The list's chrome: card, header strip, count and game headers. */
export const LIST_TONE = {
  light: {
    // `max-h-full min-h-0`: the card never runs past the column the film
    // tab gives it — the rows scroll inside it (below) — but a short cut
    // stays a short card rather than stretching to the column's height.
    // No inner padding (canvas "Folded list v2"): the header strip and the
    // rows run edge to edge, as the room's drawer does; `overflow-hidden`
    // keeps a full-bleed row's wash inside the card's radius.
    root: "surface-card flex max-h-full min-h-0 flex-col overflow-hidden",
    rootStyle: undefined,
    header:
      "flex items-center gap-2 px-2.5 pt-[11px] pb-2 shadow-[inset_0_-1px_0_var(--border-hairline)]",
    clear:
      "inline-flex h-[22px] shrink-0 cursor-pointer items-center text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    count:
      "mono tabular pr-1 text-[10px] whitespace-nowrap text-[var(--ink-400)]",
    countSlash: "var(--ink-300)",
    collapse:
      "inline-flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    collapseIcon: "h-3.5 w-3.5 text-[var(--ink-500)]",
    gameHeader: "flex items-center px-[14px] pt-[13px] pb-[5px]",
    gameLabel:
      "mono text-[9px] tracking-[1.4px] text-[var(--ink-400)] uppercase",
    gameMeta: "mono tabular text-[10px] text-[var(--ink-400)]",
  },
  dark: {
    // No card: the drawer (R3) draws the 320px surface, its left hairline and
    // its shadow; the list fills it and paints nothing of its own.
    root: "flex max-h-full min-h-0 flex-col",
    rootStyle: undefined,
    // Frame R3's header is `padding:13px 10px 10px` over an inset hairline.
    // `FilmQuickFilters`' dark trigger carries its own `mb-[7px]`, so every
    // sibling below repeats that margin — `items-center` then centres them on
    // the same box — and the header's own bottom padding is the remaining 3px.
    header:
      "flex items-center gap-2 px-2.5 pt-[13px] pb-[3px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
    clear:
      "mb-[7px] inline-flex h-[22px] shrink-0 cursor-pointer items-center text-[11px] font-medium text-white/70 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    count: "mono tabular mb-[7px] text-[10px] whitespace-nowrap text-white/45",
    countSlash: "rgba(255,255,255,0.25)",
    collapse:
      "mb-[7px] inline-flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    collapseIcon: "h-3.5 w-3.5 text-white/70",
    gameHeader: "flex items-center px-[14px] pt-[13px] pb-[5px]",
    gameLabel: "mono text-[9px] tracking-[1.4px] text-white/45 uppercase",
    gameMeta: "mono tabular text-[10px] text-white/40",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;

/**
 * The row's paint, per tone. Geometry is NOT in here — 52px, the 30px mark,
 * the 26px score slide and the 2px `--blue` progress rule are the row itself
 * and are identical in both tones; only the surfaces and the inks differ.
 */
export const ROW_TONE = {
  light: {
    // The room's row hover (handoff F3), in the light treatment: the wash
    // fades in, the score slides 26px left and the bookmark fades in where it
    // was — one motion vocabulary for the same row in the tab and in the room.
    // Full-bleed on 14px sides, no radius — the room's row in light inks.
    root: "group/row relative flex min-h-[52px] items-center gap-3 px-[14px] py-1.5 transition-colors duration-200",
    seekable:
      "cursor-pointer hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    playing: "bg-[var(--surface-subtle)]",
    mark: "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium tracking-[0.3px] text-[var(--ink-700)]",
    title: "truncate text-[12px] font-medium text-[var(--ink-900)]",
    // `.text-micro` is unlayered and would win on colour, so the detail spells
    // its own 11px and takes the ink inline, as the dark branch does.
    detail: "truncate text-[11px]",
    detailStyle: { color: "var(--ink-500)" } as const,
    score: `mono tabular inline-block min-w-[52px] text-right ${FILM_ROW_SLIDE_TRANSITION}`,
    scoreStyle: { fontSize: "11px", color: "var(--ink-700)" } as const,
    save: `absolute right-[14px] inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 ${FILM_ROW_ACTION_TRANSITION} focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`,
    savedInk: "var(--blue)",
    restingInk: "var(--ink-400)",
  },
  dark: {
    // Frame R3: full-bleed rows on the drawer's own 14px side padding, so the
    // T7 shots well can run edge to edge under the playing one. No radius —
    // a rounded row inside a 320px drawer would read as a card.
    root: "group/row relative flex min-h-[52px] items-center gap-3 px-[14px] py-1.5 transition-colors duration-200",
    seekable:
      "cursor-pointer hover:bg-white/[0.06] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    playing: "bg-white/[0.08]",
    mark: "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] bg-white/[0.14] text-[11px] font-medium tracking-[0.3px] text-white/90",
    title: "truncate text-[12px] font-medium text-white",
    // `.text-micro` would win on colour here (unlayered DS class), so the dark
    // detail spells its own 11px and takes the ink inline.
    detail: "truncate text-[11px]",
    detailStyle: { color: "rgba(255,255,255,0.45)" } as const,
    // Same story for `.text-scoreboard-sm`: the room's score is mono, not the
    // scoreboard face, so the dark branch does not borrow the class at all.
    score: `mono tabular inline-block min-w-[52px] text-right ${FILM_ROW_SLIDE_TRANSITION}`,
    scoreStyle: { fontSize: "11px", color: "rgba(255,255,255,0.85)" } as const,
    save: `absolute right-[14px] inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 ${FILM_ROW_ACTION_TRANSITION} focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`,
    // Saving is the room's one filled glyph (R9) — white, not blue: blue on
    // the dark scope is reserved for the progress rule and the serve dot.
    savedInk: "rgba(255,255,255,1)",
    restingInk: "rgba(255,255,255,0.75)",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;

/**
 * The playing point's shot well, per tone.
 *
 * Dark is the room's drawer: a recessed `rgba(0,0,0,0.28)` strip under the
 * row, and the playing shot is the lightest row in it. Light is the report
 * column (canvas "Folded list v2"): the open point and its shots are ONE
 * full-bleed band — `wrap` puts the row and the well on the same
 * `--surface-subtle` wash between hairlines, a hairline separates the shots
 * from the row, the opponent's mark turns white so it does not vanish into the
 * wash, and the playing shot is the one white row, the light mirror of the
 * room's lit row.
 */
export const WELL_TONE = {
  light: {
    wrap: "bg-[var(--surface-subtle)] shadow-[inset_0_1px_0_rgba(0,0,0,0.06),inset_0_-1px_0_rgba(0,0,0,0.06)] [&_[data-mark=opp]>span]:bg-[var(--surface-card)] [&_[data-mark=opp]>span]:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
    inner:
      "flex min-h-0 flex-col overflow-hidden pt-0.5 pb-1.5 shadow-[inset_0_1px_0_rgba(0,0,0,0.05)]",
    rowPad: "px-[14px]",
    lit: "bg-[var(--surface-card)] shadow-[inset_0_1px_0_rgba(0,0,0,0.04),inset_0_-1px_0_rgba(0,0,0,0.04)]",
    rest: "hover:bg-[rgba(0,0,0,0.03)]",
    order: "var(--ink-500)",
    muted: "var(--ink-700)",
    stroke: "var(--ink-700)",
    strokeLit: "var(--ink-900)",
  },
  dark: {
    wrap: null,
    inner:
      "flex min-h-0 flex-col overflow-hidden bg-[rgba(0,0,0,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(255,255,255,0.06)]",
    rowPad: "px-[14px]",
    lit: "bg-[rgba(255,255,255,0.12)]",
    rest: "hover:bg-[rgba(255,255,255,0.05)]",
    order: "rgba(255,255,255,0.35)",
    muted: "rgba(255,255,255,0.5)",
    stroke: "rgba(255,255,255,0.72)",
    strokeLit: "#FFFFFF",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;
