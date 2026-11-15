"use client";

import { useState } from "react";
import { Clock, Plus } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { AddPilotDialog } from "@/components/admin/pilots/add-pilot-dialog";
import { PilotsTable } from "@/components/admin/pilots/pilots-table";
import { SetHoursDialog } from "@/components/admin/pilots/set-hours-dialog";
import {
  pilotPlacesLabel,
  type AdminPilotRow,
} from "@/lib/data/admin-pilots-view";
import { PILOT_INDIVIDUAL_MAX_PLAYERS } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Admin › Pilots (board Pilots2).
 *
 * One list — `PilotsTable`, the same rows Admin › Teams' "Pilot players" view
 * shows — and three writes: Add pilot and Set hours (any account) in the
 * header, and the table's own row writes, Set hours and Remove.
 */
export function PilotsPageContent({
  rows,
}: {
  rows: readonly AdminPilotRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [settingHours, setSettingHours] = useState(false);

  const full = rows.length >= PILOT_INDIVIDUAL_MAX_PLAYERS;

  return (
    <AdminPage>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Pilots</h1>
          <p className="text-body-sm mt-[9px] tabular-nums">
            {pilotPlacesLabel(rows.length)} · personal workspace only
          </p>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={settingHours}
          className={advButton("outline", "md")}
          onClick={() => setSettingHours(true)}
        >
          <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
          Set hours
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={adding}
          className={advButton("primary", "md")}
          disabled={full}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          Add pilot
        </button>
      </div>

      <PilotsTable
        rows={rows}
        className="mt-5"
        emptyAction={{ label: "Add pilot", onClick: () => setAdding(true) }}
      />

      {adding ? <AddPilotDialog onClose={() => setAdding(false)} /> : null}
      {settingHours ? (
        <SetHoursDialog
          initialEmail=""
          onClose={() => setSettingHours(false)}
        />
      ) : null}
    </AdminPage>
  );
}
