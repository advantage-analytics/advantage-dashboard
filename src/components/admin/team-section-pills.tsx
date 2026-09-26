"use client";

import { useEffect, useRef, useState } from "react";

import { TEAM_SECTION_PILLS } from "@/components/admin/team-sections";
import { viewPillProps } from "@/components/admin/view-pills";

/**
 * The Admin › Teams detail page's section row —
 * `Overview · People · Roster · Schedule & results · Usage · Activity log`.
 *
 * These are **anchors, not tabs**. The page behind them is one scroll, so
 * there is no choice being made among siblings and none of the tab grammar
 * applies: no 2px blue underline, no `layoutId` slide, no route change. They
 * wear the canvas' `.vp` pill — the same one `ViewPills` paints, taken from
 * `viewPillProps()` so the geometry lives in one file — and mark the reader's
 * position with `aria-current="location"`, which is what a link to a place on
 * the page you are already on means.
 *
 * **Why an IntersectionObserver and not a scroll handler.** The active pill
 * has to answer "which section am I in", which is a question about element
 * boxes, not about `scrollY`; computing it from scroll means calling
 * `getBoundingClientRect()` on nine elements on every frame of a scroll. The
 * observer is told the band once — from 64px below the viewport top (clear of
 * the 44px sticky header, `--header-h`) down to 55% of the way through it —
 * and then only speaks when a section enters or leaves it.
 *
 * **The tie-break.** The rail runs *alongside* the main column, so two, three
 * or four sections are inside that band at any moment. The winner is the
 * first one in `TEAM_SECTION_PILLS` order, which is the row's own reading
 * order — so People beats Usage while both are up, and the row never
 * flickers between a main-column section and a rail one. When nothing is in
 * the band the row holds whatever it last showed, except at the very top of
 * the page, where it falls back to Overview.
 */

const OBSERVER_ROOT_MARGIN = "-64px 0px -55% 0px";

/** How near the top counts as "the top of the page", in px. */
const OVERVIEW_SCROLL_EPSILON = 48;

export function TeamSectionPills() {
  const [activeId, setActiveId] = useState("overview");
  const visible = useRef(new Set<string>());

  useEffect(() => {
    const targets = TEAM_SECTION_PILLS.filter((pill) => pill.target !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.current.add(entry.target.id);
          } else {
            visible.current.delete(entry.target.id);
          }
        }

        const inBand = targets.find((pill) =>
          visible.current.has(pill.target as string),
        );

        if (inBand) {
          setActiveId(inBand.id);
        } else if (window.scrollY <= OVERVIEW_SCROLL_EPSILON) {
          setActiveId("overview");
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN },
    );

    for (const pill of targets) {
      const element = document.getElementById(pill.target as string);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <nav className="flex items-center gap-2" aria-label="Sections on this page">
      {TEAM_SECTION_PILLS.map((pill) => {
        const isActive = activeId === pill.id;
        return (
          <a
            key={pill.id}
            href={pill.target ? `#${pill.target}` : "#top"}
            aria-current={isActive ? "location" : undefined}
            {...viewPillProps(isActive)}
          >
            {pill.label}
          </a>
        );
      })}
    </nav>
  );
}
