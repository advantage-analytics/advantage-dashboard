"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
  TEAM_VIEWS,
  teamRailFor,
  teamViewFrom,
  teamViewTitle,
  type TeamSectionId,
} from "@/components/admin/team-sections";
import { viewPillProps } from "@/components/admin/view-pills";

/**
 * The Admin › Teams detail page's pill row and the two columns it filters —
 * `Overview · People · Roster · Schedule & results · Usage · Activity log`.
 *
 * **Views, not anchors** (decision 2026-09-26). Each pill shows only its own
 * cards in the main column; `Overview` shows them all; the rail stays. See
 * `team-sections.ts` for which view shows what.
 *
 * The cards are rendered on the server and handed in whole, so switching a
 * view is a client-side choice among nodes that already exist — no fetch, no
 * loading state. The view is written to `?view=` with
 * `window.history.replaceState`, which the App Router syncs into
 * `useSearchParams` without a navigation (`linking-and-navigating.md`), so a
 * copied URL lands on the same view and the server render agrees with it.
 * Replace, not push: flipping between views is looking, not going somewhere,
 * and a Back that walked through every pill would be a trap.
 *
 * The pills stay links (`?view=…`) so a middle-click opens the view in a new
 * tab; a plain click is intercepted and swaps in place. `aria-current="page"`
 * marks the active one — it names the view being shown, which is what a pill
 * that switches the page's contents means.
 */
export function TeamSectionView({
  programName,
  cards,
}: {
  /** For the tab title — "Centennial High School · Roster". */
  programName: string;
  /** Every section's rendered card, keyed by id. */
  cards: Record<TeamSectionId, React.ReactNode>;
}) {
  const view = teamViewFrom(useSearchParams().get("view"));

  // The server set the title for the view it rendered; this keeps it in step
  // after a client-side switch, which fetches no new metadata.
  useEffect(() => {
    document.title = teamViewTitle(programName, view);
  }, [programName, view]);

  const select = (id: string) => (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    if (id === "overview") params.delete("view");
    else params.set("view", id);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  };

  return (
    <>
      <nav className="flex items-center gap-2" aria-label="Views of this team">
        {TEAM_VIEWS.map((pill) => {
          const isActive = pill.id === view.id;
          return (
            <a
              key={pill.id}
              href={pill.id === "overview" ? "?" : `?view=${pill.id}`}
              onClick={select(pill.id)}
              aria-current={isActive ? "page" : undefined}
              {...viewPillProps(isActive)}
            >
              {pill.label}
            </a>
          );
        })}
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <Column ids={view.main} cards={cards} />
        <Column ids={teamRailFor(view)} cards={cards} />
      </div>
    </>
  );
}

/**
 * One column: a 24px stack of `<section id>` wrappers — the canvas'
 * `.col`. The ids stay on every render so `#conference` and friends land.
 */
function Column({
  ids,
  cards,
}: {
  ids: readonly TeamSectionId[];
  cards: Record<TeamSectionId, React.ReactNode>;
}) {
  return (
    <div className="flex flex-col gap-6">
      {ids.map((id) => (
        <section key={id} id={id} className="scroll-mt-16">
          {cards[id]}
        </section>
      ))}
    </div>
  );
}
