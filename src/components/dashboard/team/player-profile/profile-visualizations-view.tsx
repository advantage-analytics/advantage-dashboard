"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

import { LegendMark } from "@/components/dashboard/matches/match-detail/shots/legend-mark";
import { LifecycleChip } from "@/components/dashboard/matches/match-detail/shots/lifecycle-chip";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { wallLegendItems } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import {
  EMPTY_VIZ_FILTERS,
  type PlayerFilter,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { VizStateProvider } from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import type { WallCollection } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { WallCard } from "@/components/dashboard/matches/match-detail/shots/wall-card";
import type {
  SeasonCard,
  SeasonLightboxData,
} from "@/lib/data/player-season-viz";
import { cn } from "@/lib/utils";
import { SeasonVizLightbox } from "./season-viz-lightbox";

/**
 * The player profile's Visualizations tab (design Q): the match report's
 * wall (`viz-wall.tsx`, canvas W5 + card D3) over a season — the same strip
 * (`Default | Saved` · `You | Opponent` · the legend), the same 2×2 grid of
 * `WallCard`s — with every figure computed on the server by
 * `buildSeasonCards` (`lib/data/player-season-viz.ts`). Nothing here counts
 * anything, and no point reaches this module: `cards` carry marks and a
 * footer, `lightbox` the opened card's court and statistics.
 *
 * Attribution (guardrails §4): each match's seat was read once, on the
 * server, by the season loader; this view never sees player1/player2.
 *
 * The URL is the state, as on the report (`viz-url.ts`): `?player=` is the
 * wall's side, `?cut=` and its filters the opened card. `VizStateProvider`
 * is mounted ONCE here, around the cards and the lightbox, so a card's
 * click, the switch and the lightbox's edits all write the same store — and
 * every write is a `router.replace`, which re-renders the page on the
 * server with the new state. `side` is the side the server computed the
 * cards for; the pressed chip follows the store so a switch reads at once,
 * and until the server's cards are the chip's the wall reads busy
 * (`SeasonWall`). `errorSplitJudged` is the season's own Error-type rule
 * (`seasonErrorSplitJudged`), handed to the store so a `?verr=` in a link
 * parses in the browser exactly as the page parsed it on the server — the
 * store's default is the match's rule, which a season has no provider for.
 *
 * The wall's own player (`SeasonVizBody`, the report's `shots-tab.tsx`
 * rule): while a card is open `state.filters.player` is the card's — its
 * You | Opponent switch rewrites it — so the wall keeps the player it was
 * showing when the card opened, and closing goes back to it rather than to
 * the side the reader switched to inside the card.
 *
 * Saved: saved views are the workspace's (`saved_views`), listed and managed
 * on the match report with the report's own context; the season lists none
 * yet, and its Saved side says so in the wall's empty shape rather than
 * offering a "Create view" that the read-only season lightbox cannot keep.
 */
export function ProfileVisualizationsView({
  playerName,
  firstName,
  analyzed,
  side,
  cards,
  lightbox,
  errorSplitJudged,
}: {
  /** The player's full name — the cards' subject for "you". */
  playerName: string;
  /** Their given name, for the empty sentences. */
  firstName: string;
  /** Matches with points — the season's size; `0` draws the empty wall. */
  analyzed: number;
  /** The side the server computed `cards` for (`?player=`). */
  side: PlayerFilter;
  cards: SeasonCard[];
  /** The opened card, when `?cut=` names one; `null` on the wall. */
  lightbox: SeasonLightboxData | null;
  /** The season's Error-type rule: every analyzed match judged its errors. */
  errorSplitJudged: boolean;
}) {
  return (
    <VizStateProvider errorSplitJudged={errorSplitJudged}>
      <SeasonVizBody
        playerName={playerName}
        firstName={firstName}
        analyzed={analyzed}
        side={side}
        cards={cards}
        lightbox={lightbox}
      />
    </VizStateProvider>
  );
}

/**
 * Inside the store: the wall and, over it, the lightbox container — which
 * is always mounted, because it is the one that knows the reader has just
 * opened a card the server has not answered for yet (it draws the shell
 * pending then; `season-viz-lightbox.tsx`, "Two clocks").
 */
function SeasonVizBody({
  playerName,
  firstName,
  analyzed,
  side,
  cards,
  lightbox,
}: {
  playerName: string;
  firstName: string;
  analyzed: number;
  side: PlayerFilter;
  cards: SeasonCard[];
  lightbox: SeasonLightboxData | null;
}) {
  const { state } = useVizState();

  // The wall's own player, as `shots-tab.tsx` keeps it. On the wall it is
  // the store's (so the chip reads pressed the instant it is clicked); while
  // a card is open the store's player belongs to the card and the wall holds
  // what it had. A hard load of an open card (`?cut=…&player=…`) has no
  // "what it had", and takes the card's side — the one the server drew the
  // cards for, and the one the card was most likely opened from. A
  // render-phase update on the wall, as the report does it; no effect.
  const [wallPlayer, setWallPlayer] = useState<PlayerFilter>(() =>
    state.cut === null ? state.filters.player : side,
  );
  if (state.cut === null && state.filters.player !== wallPlayer) {
    setWallPlayer(state.filters.player);
  }

  return (
    <>
      <SeasonWall
        playerName={playerName}
        firstName={firstName}
        analyzed={analyzed}
        side={side}
        player={wallPlayer}
        cards={cards}
      />
      <SeasonVizLightbox
        data={lightbox}
        wallPlayer={wallPlayer}
        analyzed={analyzed}
      />
    </>
  );
}

function SeasonWall({
  playerName,
  firstName,
  analyzed,
  side,
  player,
  cards,
}: {
  playerName: string;
  firstName: string;
  analyzed: number;
  /** The side `cards` were computed for. */
  side: PlayerFilter;
  /** The wall's own You | Opponent — the pressed chip. */
  player: PlayerFilter;
  cards: SeasonCard[];
}) {
  const { setState, hrefFor } = useVizState();
  const [collection, setCollection] = useState<WallCollection>("default");

  function choosePlayer(next: PlayerFilter) {
    if (next === player) return;
    setState((prev) => ({
      ...prev,
      cut: null,
      filters: { ...EMPTY_VIZ_FILTERS, player: next },
      viewId: null,
    }));
  }

  const visible = cards.filter((card) => card.total > 0);
  const subjectName = side === "you" ? playerName : "Opponents";

  // The cards are another side's than the chip's for one round trip — after
  // a chip click, or after closing a card whose player was switched inside
  // it — so until the server's cards are the chip's the wall reads busy:
  // `aria-busy`, dimmed, and not for opening (a card for the wrong side
  // would open the wrong court: pointer events are off and an activation
  // that still arrives, Enter on a focused card, is swallowed), with one
  // status naming what is on its way. Not `inert`, as the day-zero pages
  // are: the lightbox returns focus to the card that opened it the moment
  // it closes, and this wall is busy at exactly that moment after a card
  // whose player was switched — an inert card cannot take focus. The cards
  // stay drawn, since they are real and a moment old, never a skeleton; a
  // season with nothing analyzed has nothing to recompute.
  const stale = analyzed > 0 && side !== player;
  const arriving =
    player === "you" ? `${playerName}’s courts` : "the opponents’ courts";

  return (
    <div className="@container flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-2" role="group" aria-label="View">
          {(["default", "saved"] as const).map((value) => (
            <LifecycleChip
              key={value}
              pressed={collection === value}
              onClick={() => setCollection(value)}
            >
              {value === "default" ? "Default" : "Saved"}
            </LifecycleChip>
          ))}
        </div>
        {collection === "default" && (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-px"
              style={{ backgroundColor: "var(--border-medium)" }}
            />
            <div className="flex gap-2" role="group" aria-label="Player">
              {(["you", "opponent"] as const).map((value) => (
                <LifecycleChip
                  key={value}
                  pressed={player === value}
                  onClick={() => choosePlayer(value)}
                >
                  {value === "you" ? "You" : "Opponent"}
                </LifecycleChip>
              ))}
            </div>
            <div className="flex-1" />
            <div
              role="group"
              aria-label="Legend"
              className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px]"
            >
              {wallLegendItems().map((item) => (
                <LegendMark key={item.key} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
      {collection === "default" ? (
        <>
          {stale && (
            <p role="status" className="sr-only">
              Loading {arriving}
            </p>
          )}
          <div
            aria-busy={stale || undefined}
            onClickCapture={stale ? swallowActivation : undefined}
            data-stale={stale ? "" : undefined}
            className={cn(
              "flex flex-col",
              stale &&
                "pointer-events-none opacity-40 motion-safe:transition-opacity motion-safe:duration-200",
            )}
          >
            {analyzed === 0 ? (
              <EmptyWall>
                No analyzed matches yet. Serve, return and rally placement is
                drawn from the points in {firstName}&rsquo;s matches, as each
                one is analysed.
              </EmptyWall>
            ) : visible.length > 0 ? (
              <div
                role="list"
                aria-label="Default views"
                className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2"
              >
                {/* Keyed on the cut, not the side: the slot's element stays
                    when the server's cards change side under an open card
                    (a player switched inside it), so the card the lightbox
                    recorded as its opener is still on the page to take
                    focus back when it closes. */}
                {visible.map((card) => (
                  <div key={card.cut} role="listitem">
                    <WallCard
                      name={card.name}
                      playerName={subjectName}
                      possessive={card.subject === "you" ? "your" : "their"}
                      cut={card.cut}
                      dots={card.dots}
                      summary={card.summary}
                      href={hrefFor(card.state)}
                      navigateState={card.state}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyWall>
                No serves, returns, or rallies recorded yet.
              </EmptyWall>
            )}
          </div>
        </>
      ) : (
        <EmptyWall>
          Saved views live on the match report. Open one of {firstName}&rsquo;s
          matches to create or use one.
        </EmptyWall>
      )}
    </div>
  );
}

/** A card's activation while the wall is busy: nothing opens (see `stale`). */
function swallowActivation(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The redesign wall's honest zero (`viz-wall.tsx`'s `EmptyWall`, shape for
 * shape): one sentence in the card's hairline, never an empty court — an
 * empty serve chart reads as "you hit no serves". The sentence is the
 * caller's: a season with nothing analyzed, a season whose points carry no
 * placement, or the Saved side.
 */
function EmptyWall({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      data-testid="season-viz-empty"
      className="flex items-center justify-center rounded-[var(--radius-card)] border px-6 py-8 text-center"
      style={{
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
      }}
    >
      <p
        className="max-w-[56ch] text-[12px] leading-[1.6]"
        style={{ color: "var(--ink-500)" }}
      >
        {children}
      </p>
    </div>
  );
}
