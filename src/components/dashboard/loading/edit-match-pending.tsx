import {
  EDIT_MATCH_FIELD_ROWS,
  type EditMatchFieldRow,
  type EditMatchSection,
} from "@/components/dashboard/matches/match-actions/edit-match-rows";
import { PendingBar, PendingRegion } from "./pending";

/**
 * The Edit match dialog's body while the match is read — in place of the
 * form, in its geometry, so the dialog does not resize when the fields land.
 * The dialog's title, description and Close button are real chrome around it.
 *
 * One bar row per `EDIT_MATCH_FIELD_ROWS` entry (each carries
 * `data-pending-row`), in the form's own sections and spacing: the Score
 * caption over two rows of a name and three 40px set cells; the Players
 * grid's three tracks, the second row's menus uncaptioned as in the form;
 * then Event, and Details' two-column grid. Every caption is a bar too —
 * whether Details renders at all depends on the match, so none of it is
 * written as text. Nothing here is focusable.
 */

const PLAYERS_GRID =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-end gap-x-4";

const rowsOf = (section: EditMatchSection) =>
  EDIT_MATCH_FIELD_ROWS.filter((row) => row.section === section);

/** A caption and an underline field's value, as `SettingsField` stacks them. */
function Field({ captioned = true }: { captioned?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {captioned && <PendingBar className="h-2.5 w-16" />}
      <div className="flex h-[34px] items-center">
        <PendingBar className="h-3 w-3/4" />
      </div>
    </div>
  );
}

function ScoreRow({ row }: { row: EditMatchFieldRow }) {
  return (
    <div data-pending-row={row.fields[0]} className="flex items-center gap-4">
      <span className="min-w-0 flex-1">
        <PendingBar className="w-32" />
      </span>
      <span className="flex gap-3">
        {[0, 1, 2].map((set) => (
          <PendingBar
            key={set}
            className="h-10 w-10 rounded-[var(--radius-cell)]"
          />
        ))}
      </span>
    </div>
  );
}

export function EditMatchPending() {
  const [event, ...grid] = rowsOf("Details");
  return (
    <PendingRegion label="match" innerClassName="flex flex-col gap-10 py-0.5">
      <section className="flex flex-col gap-3">
        <PendingBar className="h-2.5 w-10" />
        <div className="flex flex-col gap-2.5">
          {rowsOf("Score").map((row) => (
            <ScoreRow key={row.fields[0]} row={row} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        {rowsOf("Players").map((row, i) => (
          <div
            key={row.fields[0]}
            data-pending-row={row.fields[0]}
            className={PLAYERS_GRID}
          >
            {row.fields.map((field, cell) => (
              <Field key={field} captioned={i === 0 || cell === 0} />
            ))}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3.5">
        {event && (
          <div data-pending-row={event.fields[0]} className="flex flex-col">
            <Field />
          </div>
        )}
        {grid.map((row) => (
          <div
            key={row.fields[0]}
            data-pending-row={row.fields[0]}
            className="grid grid-cols-2 gap-x-4"
          >
            {row.fields.map((field) => (
              <Field key={field} />
            ))}
          </div>
        ))}
      </section>
    </PendingRegion>
  );
}
