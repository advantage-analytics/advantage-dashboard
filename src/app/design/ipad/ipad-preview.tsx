"use client";

import { useCallback, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Pencil,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { KpiTile, KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  ICON_BUTTON,
  PeekDrawerFrame,
} from "@/components/dashboard/matches/match-drawer";
import { FilmTransport } from "@/components/dashboard/matches/match-detail/film/film-transport";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { useDismissOnNextPress, useLongPress } from "@/hooks/use-long-press";

const KpiDetailChart = dynamic(
  () => import("@/components/dashboard/shared/kpi-detail-chart"),
  { ssr: false },
);

const noop = () => {};

/**
 * The touch rules, simulated for the "With touch fixes" frames only.
 *
 * Shipped, these become a `touch:` variant — `(hover: none) and (pointer:
 * coarse)` — so a mouse never sees them. Here they hang off
 * `[data-force-touch]` so a desktop browser can show them too.
 *
 * - Every button and slider gets an invisible 44px hit area (`::after`),
 *   centred on the glyph; the glyph itself does not grow.
 * - Controls that only appear on hover (`data-hover-reveal`) stay visible.
 * - "Today" frames (`data-sim-ipad`) hide those same controls, as an iPad does.
 */
const TOUCH_CSS = `
@layer base {
[data-force-touch] :is(button[aria-label], [role="slider"]):not([data-no-hit]) { position: relative; }
[data-force-touch] :is(button[aria-label], [role="slider"]):not([data-no-hit])::after {
  content: "";
  position: absolute;
  top: min(0px, calc((100% - 44px) / 2));
  bottom: min(0px, calc((100% - 44px) / 2));
  left: min(0px, calc((100% - 44px) / 2));
  right: min(0px, calc((100% - 44px) / 2));
  border-radius: 10px;
}
[data-show-hits] [data-force-touch] :is(button[aria-label], [role="slider"]):not([data-no-hit])::after {
  outline: 1px dashed rgb(42 116 255 / 0.75);
  background: rgb(42 116 255 / 0.08);
}
[data-force-touch] [data-hover-reveal] { opacity: 1 !important; }
[data-sim-ipad] [data-hover-reveal] { opacity: 0 !important; }
}
`;

/** `chrome-tooltip.tsx`'s SURFACE, verbatim — the dark label. */
const TOOLTIP_SURFACE =
  "flex flex-col items-start gap-0.5 rounded-[12px] border-0 bg-[var(--ink-900)] px-2.5 py-[7px] " +
  "text-[12px] font-medium text-white shadow-[var(--shadow-dropdown)]";

/** The touch counterpart of `ChromeTooltip`: tap acts, press-and-hold names. */
function HoldLabel({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => setOpen(true));
  const close = useCallback(() => setOpen(false), []);
  useDismissOnNextPress(open, close);
  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <span className="inline-flex" {...press}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        showArrow={false}
        className={TOOLTIP_SURFACE}
      >
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          {label}
          {shortcut && (
            <span className="font-mono text-[11px] font-normal text-white/[0.64]">
              {shortcut}
            </span>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────

const SERIES = [61, 58, 66, 63, 70, 68, 72];
const DETAIL = SERIES.map((value, i) => ({
  value,
  date: `2026-0${(i % 9) + 1}-1${i}T00:00:00Z`,
  opponent: ["Rosales", "Vicente", "Quan", "Hunter", "Sage", "Goodman", "Ace"][
    i
  ],
}));

const TILES = [
  { label: "First serve in", value: "68%", change: 4.2 },
  { label: "Points won", value: "54%", change: 1.8 },
  { label: "Break points saved", value: "61%", change: -3.1 },
  { label: "Winners", value: "23", change: 5 },
] as const;

const MATCHES = [
  { date: "Oct 18", opponent: "R. Rosales", score: "6-4, 7-5", result: "W" },
  {
    date: "Oct 12",
    opponent: "M. Vicente",
    score: "3-6, 6-3, 10-8",
    result: "W",
  },
  { date: "Oct 4", opponent: "T. Quan", score: "4-6, 2-6", result: "L" },
  { date: "Sep 27", opponent: "J. Hunter", score: "6-2, 6-1", result: "W" },
] as const;

// ─── Layout pieces ───────────────────────────────────────────────────────

function Section({
  title,
  native,
  change,
  children,
}: {
  title: string;
  native: string;
  change: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-14">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">{title}</h2>
      <dl className="mt-2 grid max-w-[80ch] grid-cols-[110px_1fr] gap-x-4 gap-y-1 text-[12px] leading-[1.6]">
        <dt className="text-[var(--ink-500)]">How iOS does it</dt>
        <dd className="text-[var(--ink-700)]">{native}</dd>
        <dt className="text-[var(--ink-500)]">What changes</dt>
        <dd className="text-[var(--ink-700)]">{change}</dd>
      </dl>
      <div className="mt-5 grid gap-6 2xl:grid-cols-2">{children}</div>
    </section>
  );
}

function Frame({
  kind,
  note,
  width,
  dark = false,
  children,
}: {
  kind: "today" | "touch";
  note: string;
  width?: number;
  dark?: boolean;
  children: ReactNode;
}) {
  const touch = kind === "touch";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[12px] font-medium",
            touch ? "text-[var(--blue)]" : "text-[var(--ink-600)]",
          )}
        >
          {touch ? "With touch fixes" : "Today on iPad"}
        </span>
        <span className="text-[11px] text-[var(--ink-500)]">{note}</span>
      </div>
      <div
        {...(touch ? { "data-force-touch": "" } : { "data-sim-ipad": "" })}
        style={width ? { width } : undefined}
        className={cn(
          "relative max-w-full overflow-hidden rounded-[14px] border p-6",
          dark
            ? "border-transparent bg-[var(--ink-900)]"
            : "border-[var(--border-hairline)] bg-[var(--surface-page)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ─── 1. Icon buttons ─────────────────────────────────────────────────────

function DrawerHeaderToday() {
  return (
    <div className="flex h-11 items-center gap-1.5 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-5">
      <ChromeTooltip label="Previous" shortcut="↑">
        <button type="button" aria-label="Previous" className={ICON_BUTTON}>
          <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </ChromeTooltip>
      <ChromeTooltip label="Next" shortcut="↓">
        <button type="button" aria-label="Next" className={ICON_BUTTON}>
          <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </ChromeTooltip>
      <span className="ml-1 text-[12px] text-[var(--ink-600)]">Match</span>
      <span className="mono tabular text-[11px] text-[var(--ink-400)]">
        2 / 24
      </span>
      <div className="flex-1" />
      <ChromeTooltip label="Open full page">
        <button
          type="button"
          aria-label="Open full page"
          className={ICON_BUTTON}
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </ChromeTooltip>
      <ChromeTooltip label="Close" shortcut="Esc">
        <button type="button" aria-label="Close" className={ICON_BUTTON}>
          <X className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </ChromeTooltip>
    </div>
  );
}

function DrawerHeaderTouch() {
  return (
    <div className="flex h-11 items-center gap-1.5 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-5">
      <HoldLabel label="Previous" shortcut="↑">
        <button type="button" aria-label="Previous" className={ICON_BUTTON}>
          <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </HoldLabel>
      <HoldLabel label="Next" shortcut="↓">
        <button type="button" aria-label="Next" className={ICON_BUTTON}>
          <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </HoldLabel>
      <span className="ml-1 text-[12px] text-[var(--ink-600)]">Match</span>
      <span className="mono tabular text-[11px] text-[var(--ink-400)]">
        2 / 24
      </span>
      <div className="flex-1" />
      <HoldLabel label="Open full page">
        <button
          type="button"
          aria-label="Open full page"
          className={ICON_BUTTON}
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </HoldLabel>
      <HoldLabel label="Close" shortcut="Esc">
        <button type="button" aria-label="Close" className={ICON_BUTTON}>
          <X className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </HoldLabel>
    </div>
  );
}

// ─── 2. KPI tiles ────────────────────────────────────────────────────────

function KpiStripToday() {
  return (
    // Not hoverable here: an iPad can't hover, so the detail chart never opens.
    <div className="pointer-events-none">
      <KpiTileStrip ariaLabel="Season summary">
        {TILES.map((t, i) => (
          <KpiTile
            key={t.label}
            index={i}
            skipAnimation
            label={t.label}
            value={t.value}
            sparkline={[...SERIES]}
            trend={{ change: t.change, changeLabel: "vs last 5" }}
            href="#"
            detail={DETAIL}
            format="percent"
          />
        ))}
      </KpiTileStrip>
    </div>
  );
}

function PeekTile({
  tile,
  index,
}: {
  tile: (typeof TILES)[number];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => setOpen(true));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex min-w-0 flex-1" {...press}>
          <KpiTile
            index={index}
            skipAnimation
            label={tile.label}
            value={tile.value}
            sparkline={[...SERIES]}
            trend={{ change: tile.change, changeLabel: "vs last 5" }}
            href="#"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <KpiDetailChart label={tile.label} points={DETAIL} format="percent" />
      </PopoverContent>
    </Popover>
  );
}

function KpiStripTouch() {
  return (
    <KpiTileStrip ariaLabel="Season summary">
      {TILES.map((t, i) => (
        <PeekTile key={t.label} tile={t} index={i} />
      ))}
    </KpiTileStrip>
  );
}

// ─── 3. Hover-revealed controls ──────────────────────────────────────────

/** `season-kpi-strip.tsx`'s Customize button, class for class. */
const CUSTOMIZE_CLASS =
  "absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#8A8A8E] opacity-0 transition-[opacity,color,background-color] duration-200 group-hover:opacity-100 hover:bg-[#F5F5F5] hover:text-[#3C3C43] focus-visible:opacity-100 focus-visible:outline-none";

function CustomizeStrip() {
  return (
    <div className="group relative">
      <KpiTileStrip ariaLabel="Season summary">
        {TILES.slice(0, 3).map((t, i) => (
          <KpiTile
            key={t.label}
            index={i}
            skipAnimation
            label={t.label}
            value={t.value}
            sparkline={[...SERIES]}
            trend={{ change: t.change, changeLabel: "vs last 5" }}
          />
        ))}
      </KpiTileStrip>
      <button
        type="button"
        aria-label="Customize season tiles"
        data-hover-reveal=""
        className={CUSTOMIZE_CLASS}
      >
        <Settings2 className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── 4. Matches list in portrait ─────────────────────────────────────────

function MatchRows({ onOpen }: { onOpen?: (i: number) => void }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="grid grid-cols-[72px_1fr_140px_40px] border-b border-[var(--border-hairline)] px-5 py-2.5">
        {["Date", "Opponent", "Score", ""].map((h) => (
          <span key={h} className="eyebrow-sm">
            {h}
          </span>
        ))}
      </div>
      {MATCHES.map((m, i) => (
        <button
          key={m.date}
          type="button"
          onClick={() => onOpen?.(i)}
          className="grid h-[52px] w-full grid-cols-[72px_1fr_140px_40px] items-center border-b border-[var(--border-hairline)] px-5 text-left text-[13px] last:border-b-0 hover:bg-[var(--surface-subtle)]"
        >
          <span className="text-[var(--ink-500)] tabular-nums">{m.date}</span>
          <span className="text-[var(--ink-900)]">{m.opponent}</span>
          <span className="mono tabular text-[12px] text-[var(--ink-700)]">
            {m.score}
          </span>
          <span
            className={cn(
              "text-[12px] font-medium",
              m.result === "W" ? "text-[#5DB955]" : "text-[#E51837]",
            )}
          >
            {m.result}
          </span>
        </button>
      ))}
    </div>
  );
}

function MatchesTouch() {
  const [open, setOpen] = useState<number | null>(1);
  const m = open === null ? null : MATCHES[open];
  return (
    <div className="relative h-[460px]">
      <MatchRows onOpen={setOpen} />
      {m && (
        <>
          <button
            type="button"
            aria-label="Close drawer"
            data-no-hit=""
            onClick={() => setOpen(null)}
            className="absolute -inset-6 bg-black/20"
          />
          {/* The real drawer frame, re-seated as an overlay sheet: below lg it
              covers the table instead of being `hidden`. */}
          {/* The frame draws its own fixed scrim below lg; inside this
              mock-up the frame's box is the screen, so it uses the one above. */}
          <div className="absolute -top-6 -right-6 -bottom-6 [&_aside]:!static [&_aside]:!block [&_aside]:!h-full [&>button]:!hidden">
            <PeekDrawerFrame
              kind="Match"
              label={`Match against ${m.opponent}`}
              index={open!}
              total={MATCHES.length}
              canPrev={open! > 0}
              canNext={open! < MATCHES.length - 1}
              closing={false}
              autoFocus={false}
              focusKey={m.date}
              onPrev={() => setOpen((i) => Math.max(0, (i ?? 0) - 1))}
              onNext={() =>
                setOpen((i) => Math.min(MATCHES.length - 1, (i ?? 0) + 1))
              }
              onClose={() => setOpen(null)}
              onClosed={noop}
              actions={
                <>
                  <button
                    type="button"
                    aria-label="Edit match"
                    className={ICON_BUTTON}
                  >
                    <Pencil
                      className="size-3.5"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete match"
                    className={ICON_BUTTON}
                  >
                    <Trash2
                      className="size-3.5"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </button>
                </>
              }
              footer={
                <button
                  type="button"
                  className={cn(advButton("primary", "lg"), "w-full")}
                >
                  Open match report
                </button>
              }
            >
              <div className="flex flex-1 flex-col gap-1 px-[22px] py-5">
                <p className="text-[16px] font-medium text-[var(--ink-900)]">
                  {m.opponent}
                </p>
                <p className="mono tabular text-[13px] text-[var(--ink-700)]">
                  {m.score}
                </p>
                <p className="text-[12px] text-[var(--ink-500)]">
                  {m.date}, 2026
                </p>
              </div>
            </PeekDrawerFrame>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 5. Film transport ───────────────────────────────────────────────────

function Transport() {
  const [time, setTime] = useState(1240);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative -m-6 h-[220px]">
      <FilmTransport
        title="Point 34 · Set 2, 3–2"
        subtitle="Gimena serving · 30–15"
        position={{ index: 34, total: 118 }}
        segments={[
          { start: 0, end: 2100 },
          { start: 2100, end: 3600 },
        ]}
        duration={3600}
        currentTime={time}
        playing={playing}
        muted={false}
        rate={1}
        looping={false}
        skippingDeadTime
        saved={false}
        canStep
        courtOn
        previewSource={{ url: null, generation: 0 }}
        onSeek={setTime}
        onTogglePlay={() => setPlaying((p) => !p)}
        onStep={noop}
        onToggleSaved={noop}
        onToggleSkipDeadTime={noop}
        onCycleRate={noop}
        onToggleLoop={noop}
        onToggleMute={noop}
        onToggleCourt={noop}
        onExit={noop}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export function IpadPreview() {
  const [showHits, setShowHits] = useState(true);
  return (
    <main
      {...(showHits ? { "data-show-hits": "" } : {})}
      // Its own scroll box, the way the dashboard shell scrolls: iPad Safari
      // won't scroll a body that globals.css gives `overflow` on both axes.
      className="h-dvh overflow-y-auto overscroll-contain bg-[var(--surface-page)] px-14 py-10"
    >
      <style>{TOUCH_CSS}</style>
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        iPad: finger-friendly dashboard
      </h1>
      <p className="mt-1 max-w-[72ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        Each row shows the same real component twice: as an iPad gets it today,
        and with the touch rules applied. Shipped, the rules sit behind a
        touch-only variant —{" "}
        <span className="mono text-[11px]">
          (hover: none) and (pointer: coarse)
        </span>{" "}
        — so{" "}
        <strong className="font-medium text-[var(--ink-900)]">
          a mouse or trackpad sees no change at all
        </strong>
        . The visual look on iPad stays the same too; what changes is where you
        can tap and what a press-and-hold does. On a real iPad, try holding a
        button or a KPI tile.
      </p>
      <label className="mt-5 inline-flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ink-700)]">
        <input
          type="checkbox"
          checked={showHits}
          onChange={(e) => setShowHits(e.target.checked)}
        />
        Show tap areas (dashed blue — invisible when shipped)
      </label>

      <Section
        title="1 · Icon buttons and their labels"
        native="Icons are at least 44pt to tap even when the glyph is small. There are no hover labels; a press-and-hold shows the name (like holding a toolbar button in Files or Safari)."
        change="The 28px buttons keep their look but get a 44px tap area. The dark label that appears on hover now appears on press-and-hold; a normal tap just does the action. This one change covers all 74 labelled controls, including the collapsed sidebar."
      >
        <Frame kind="today" note="28px targets; the label never appears">
          <DrawerHeaderToday />
        </Frame>
        <Frame kind="touch" note="44px targets; hold to see the name">
          <DrawerHeaderTouch />
        </Frame>
      </Section>

      <Section
        title="2 · KPI tile detail chart"
        native="Like a peek in Photos or Mail: tap opens, press-and-hold previews in place, and lifting your finger or tapping outside dismisses."
        change="Tapping a tile still opens its stat page. Holding it peeks the same detail chart that a mouse gets on hover, which today is unreachable on iPad."
      >
        <Frame kind="today" note="hover-only; the chart can't be opened">
          <KpiStripToday />
        </Frame>
        <Frame kind="touch" note="hold a tile to peek">
          <KpiStripTouch />
        </Frame>
      </Section>

      <Section
        title="3 · Controls that only appear on hover"
        native="Actions are always visible, usually as a quiet “…” or gear, never hidden behind a pointer."
        change="About a dozen controls that fade in on hover (Customize tiles, the Ask conversation “…”, photo and crest overlays, lineup drag handles, gallery actions) stay visible on touch. Same size and colour, just not hidden."
      >
        <Frame kind="today" note="the gear is there but invisible">
          <CustomizeStrip />
        </Frame>
        <Frame kind="touch" note="the gear is always shown">
          <CustomizeStrip />
        </Frame>
      </Section>

      <Section
        title="4 · Matches list in portrait (704px of page)"
        native="On a narrow width, Mail and Files slide the detail pane over the list as a sheet instead of dropping it."
        change="Below 1024px the match drawer is hidden today, and with it Edit and Delete. On touch it opens as an overlay sheet over the table; tap outside to close."
      >
        <Frame
          kind="today"
          note="tapping a row goes straight to the report"
          width={704}
        >
          <div className="h-[460px]">
            <MatchRows />
            <p className="mt-4 text-[11px] text-[var(--ink-500)]">
              No drawer at this width, so there is no way to edit or delete
              without opening the report first.
            </p>
          </div>
        </Frame>
        <Frame
          kind="touch"
          note="tap a row, and the drawer slides over"
          width={704}
        >
          <MatchesTouch />
        </Frame>
      </Section>

      <Section
        title="5 · Film room transport"
        native="The video controls in the iOS player are large and spaced out, the scrubber thumb is easy to grab, and there are no keyboard-only actions."
        change="The 15px glyphs keep their look but get 44px tap areas, and the 16px seek lane becomes a 44px strip. The overlapping areas below show the one visible change: on touch the glyphs sit a little further apart, about 26px instead of 18px, so no two areas overlap. Keyboard-only actions (J/L and the speed keys) get visible buttons."
      >
        <Frame kind="today" note="13–16px targets" dark>
          <Transport />
        </Frame>
        <Frame kind="touch" note="44px targets" dark>
          <Transport />
        </Frame>
      </Section>

      <section className="mt-14 max-w-[80ch] text-[12px] leading-[1.6] text-[var(--ink-700)]">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
          Also in the plan, not drawn here
        </h2>
        <ul className="mt-2 list-disc pl-5">
          <li>
            Chart readouts (performance tracker, heatmap, head-to-head, court
            dots) answer a tap or a drag across the chart, like the Stocks app,
            and stay up until you tap elsewhere.
          </li>
          <li>
            Page side padding drops from 56px to 32px between 768 and 1280px, so
            content isn’t squeezed beside the rail.
          </li>
          <li>
            The page fits Safari’s visible height (
            <span className="mono text-[11px]">dvh</span>) and the iPad’s screen
            edges, so nothing hides under the toolbar.
          </li>
        </ul>
      </section>
    </main>
  );
}
