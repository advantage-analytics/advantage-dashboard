"use client";

import { useMemo, useState } from "react";
import { Brain } from "lucide-react";
import { useRowSelection } from "@/components/dashboard/schedule/use-row-selection";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { TeamOpponentsGrouping } from "@/lib/data/team-opponents";
import { cn } from "@/lib/utils";
import { OpponentsFilterStrip } from "./opponents-filter-strip";
import { opponentRowId } from "./opponents-table";
import {
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_PAGE_GAP,
} from "./opponents-table-layout";
import { OpponentsTitleRow } from "./opponents-title-row";
import { OpponentsToolbar } from "./opponents-toolbar";
import {
  applyOpponentCut,
  describeOpponentFilters,
  emptyOpponentCut,
  hasOpponentFilters,
  NO_OPPONENT_FILTERS,
  opponentFacedByChoices,
  opponentProgramChoices,
  RESTING_OPPONENT_CUT,
  teamOpponentsFooter,
  teamOpponentsSubline,
  type OpponentCut,
} from "./opponents-views";
import { TeamOpponentDrawer } from "./team-opponent-drawer";
import { TeamOpponentsTable } from "./team-opponents-table";

/**
 * The populated team Opponents page: title row, toolbar, the table card and
 * the footer line — the one list-page shape (`reference/tables.md`), and the
 * personal page's composition over a program's opponents.
 *
 * A client component for the same two reasons as `OpponentsPageContent`: it
 * owns the cut (chip, filter, sort — applied here to the rows the loader
 * already sent) and which opponent is selected.
 *
 * ── The cut ─────────────────────────────────────────────────────────────────
 * The four view chips and three sorts are the personal page's. The filter
 * panel adds two checklists a team has and a person does not: Faced by (one
 * row per roster player on any listed opponent) and Program (one per place
 * the listed opponents play, then "No team"). Both lists are built from every
 * opponent the loader sent, not from the rows a chip leaves, so a tick never
 * disappears from under the cursor when the view changes.
 *
 * ── The selection ───────────────────────────────────────────────────────────
 * The shared peek-drawer model, `useRowSelection`, mirrored into
 * `?opponent=<group key>`: a row click opens the drawer beside the column and
 * the table gives up Program and Plays; re-clicking the row, Esc or the X
 * closes it; ↑/↓ step through `visibleOpponents`. `selectedId` is the washed
 * row and `drawerId` the record the drawer draws — they part for the 200ms of
 * the slide-out.
 */
export function TeamOpponentsPageContent({
  opponents,
  totals,
  initialSelectedKey = null,
}: TeamOpponentsGrouping & {
  /** `?opponent=` from the URL, or null. Ignored unless it names a listed row. */
  initialSelectedKey?: string | null;
}) {
  const [cut, setCut] = useState<OpponentCut>(RESTING_OPPONENT_CUT);

  const programChoices = useMemo(
    () => opponentProgramChoices(opponents),
    [opponents],
  );
  const facedByChoices = useMemo(
    () => opponentFacedByChoices(opponents),
    [opponents],
  );

  /**
   * `visibleOpponents` is the table's rows in the order it draws them — the
   * one sequence the drawer's stepping and counter walk. `inView` is how many
   * the chip alone holds, which the filter's "N of M" reads against.
   */
  const { visible: visibleOpponents, inView } = useMemo(
    () => applyOpponentCut(opponents, cut),
    [opponents, cut],
  );
  const visibleKeys = useMemo(
    () => visibleOpponents.map((o) => o.key),
    [visibleOpponents],
  );

  const {
    selectedId,
    drawerId,
    closing,
    openedByKeyboard,
    index,
    total,
    toggle,
    step,
    close,
    finishClose,
  } = useRowSelection({
    ids: visibleKeys,
    initialId: initialSelectedKey,
    param: "opponent",
    rowId: opponentRowId,
  });

  // Looked up in every opponent, not the visible ones: when a cut hides the
  // selected row the drawer still has its record to draw while it slides out.
  const drawerOpponent = drawerId
    ? (opponents.find((o) => o.key === drawerId) ?? null)
    : null;

  /**
   * Every chip, filter and sort change comes through here. A cut that no
   * longer lists the selected opponent closes the drawer in the same event,
   * and the close comes BEFORE the cut so the drawer is already sliding out
   * when the shorter list arrives.
   */
  const applyCut = (patch: Partial<OpponentCut>) => {
    const next = { ...cut, ...patch };
    if (
      selectedId &&
      !applyOpponentCut(opponents, next).visible.some(
        (o) => o.key === selectedId,
      )
    ) {
      close(null);
    }
    setCut(next);
  };

  const filtered = hasOpponentFilters(cut.filters);
  const clearFilters = () => applyCut({ filters: NO_OPPONENT_FILTERS });
  const emptyCut = emptyOpponentCut(cut);
  const shown = visibleOpponents.length;

  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={cn(OPPONENTS_PAGE_COLUMN, OPPONENTS_PAGE_GAP)}>
        <OpponentsTitleRow subline={teamOpponentsSubline(totals)} />
        <OpponentsToolbar
          view={cut.view}
          onViewChange={(view) => applyCut({ view })}
          filters={cut.filters}
          onFiltersChange={(filters) => applyCut({ filters })}
          sort={cut.sort}
          onSortChange={(sort) => applyCut({ sort })}
          resultCount={shown}
          totalCount={inView}
          programChoices={programChoices}
          facedByChoices={facedByChoices}
        />

        {filtered ? (
          <OpponentsFilterStrip
            description={describeOpponentFilters(cut.filters, {
              programs: programChoices,
              facedBy: facedByChoices,
            })}
            shown={shown}
            inView={inView}
            onClear={clearFilters}
          />
        ) : null}

        {/* A cut that leaves nothing keeps the card and its header row and
            says so in the body; the title row, chips and footer do not move. */}
        <TeamOpponentsTable
          opponents={visibleOpponents}
          selectedKey={selectedId}
          onToggle={toggle}
          // Tracks follow the rail: collapsed while a row is selected, and
          // reopening as soon as the slide-out starts.
          compact={selectedId !== null}
          empty={
            <TableEmptyBody
              icon={Brain}
              title={emptyCut.title}
              action={{
                label: emptyCut.action.label,
                onClick: () => applyCut(emptyCut.action.undo),
              }}
            />
          }
        />

        <div className="flex items-center gap-2">
          <span className="text-micro tabular">
            {teamOpponentsFooter(shown, totals)}
          </span>
        </div>
      </div>

      {/* The drawer slot — a sibling of the padded column, so it sits flush
          to the right edge and the column, not the page, gives up the 340px.
          T14 fills the drawer's body; the frame is mounted now so the
          selection and the two-column collapse are already real. */}
      {drawerOpponent && (
        <TeamOpponentDrawer
          opponent={drawerOpponent}
          index={Math.max(index, 0)}
          total={Math.max(total, 1)}
          closing={closing}
          autoFocus={openedByKeyboard}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => close(drawerOpponent.key)}
          onClosed={finishClose}
        />
      )}
    </div>
  );
}
