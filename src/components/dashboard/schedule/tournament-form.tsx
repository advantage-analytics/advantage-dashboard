"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import {
  EntryEditor,
  type DraftEntry,
} from "@/components/dashboard/schedule/entry-editor";
import {
  FieldRow,
  FieldCellSelect,
  FieldCellText,
} from "@/components/dashboard/schedule/field-row";
import { createTournament } from "@/lib/schedule/actions";
import { splitNames } from "@/lib/schedule/format";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventSite } from "@/lib/schedule/types";

const SITES = [
  { value: "away", label: "Away" },
  { value: "home", label: "Home" },
  { value: "neutral", label: "Neutral" },
];

const SURFACES = ["Hard", "Clay", "Grass", "Indoor hard", "Carpet"].map(
  (surface) => ({ value: surface, label: surface })
);

/**
 * Ad or no-ad, asked here rather than per upload.
 *
 * It is one of the five fields the vision pipeline refuses a job without, and
 * it is a fact about the tournament rather than about any one video — so the
 * event owns it, exactly as the dual form owns it. Without this the format was
 * `{}`, adScoring arrived null, and every tournament video failed submission
 * with "Choose ad or no-ad scoring" long after the coach had left the wizard.
 */
const FORMATS = [
  { value: "3|false", label: "Best of 3 · no-ad" },
  { value: "3|true", label: "Best of 3 · ad" },
  { value: "1|false", label: "One set · no-ad" },
  { value: "1|true", label: "One set · ad" },
];

/** 25e — a tournament as facts plus who's going. */
export function TournamentForm({
  roster,
  defaultSurface,
}: {
  roster: LadderPlayer[];
  defaultSurface: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [site, setSite] = useState<EventSite>("away");
  const [surface, setSurface] = useState(defaultSurface || "Hard");
  const [host, setHost] = useState("");
  const [format, setFormat] = useState("3|true");

  const [singles, setSingles] = useState<DraftEntry[]>([]);
  const [doubles, setDoubles] = useState<DraftEntry[]>([]);

  const named = [...singles, ...doubles]
    .map((entry) => ({ entry, labels: splitNames(entry.labels.join(" / ")) }))
    .filter((row) => row.labels.length > 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const [bestOf, adScoring] = format.split("|");
      const result = await createTournament({
        name,
        startsOn,
        endsOn,
        site,
        surface,
        host: host.trim() || null,
        bestOf: Number(bestOf),
        adScoring: adScoring === "true",
        entries: named.map((row, index) => ({
          discipline: row.entry.discipline,
          position: index,
          draw: row.entry.draw,
          seed: row.entry.seed ? Number(row.entry.seed) : null,
          playerUserIds: row.entry.userIds,
          playerLabels: row.labels,
        })),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/team/schedule/${result.eventId}`);
    });
  }

  return (
    <EventShell
      crumb="New tournament"
      footer={
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            onClick={() => router.push("/dashboard/team/schedule")}
          >
            Cancel
          </button>
          <div className="flex-1" />
          {error ? (
            <span className="text-[11px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              Creates <span className="tabular">{named.length}</span>{" "}
              {named.length === 1 ? "entry" : "entries"} and no matches — a
              tournament match exists once it&rsquo;s played
            </span>
          )}
          <button
            type="button"
            disabled={pending || !name.trim()}
            className={advButton("primary", "md")}
            onClick={submit}
          >
            {pending ? "Creating…" : "Create tournament"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <span className="eyebrow">New tournament · name</span>
          <div className="flex items-center gap-3 border-b-2 border-[var(--blue)] pb-2 pt-1.5">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Buckeye Fall Classic"
              className="w-full bg-transparent text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>
          <FieldRow>
            <FieldCellText label="Starts" value={startsOn} onChange={setStartsOn} type="date" mono />
            <FieldCellText label="Ends" value={endsOn} onChange={setEndsOn} type="date" mono />
            <FieldCellSelect
              label="Site"
              value={site}
              options={SITES}
              onChange={(value) => setSite(value as EventSite)}
            />
            <FieldCellSelect
              label="Surface"
              value={surface}
              options={SURFACES}
              onChange={setSurface}
            />
          </FieldRow>
          <div className="mt-3.5 grid grid-cols-4 gap-8">
            <FieldCellText label="Hosted by" value={host} onChange={setHost} />
            <FieldCellSelect
              label="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <EntryEditor
            title="Who's going · singles"
            addLabel="Add player"
            entries={singles}
            roster={roster}
            onChange={setSingles}
          />
          <EntryEditor
            title="Who's going · doubles"
            addLabel="Add pair"
            entries={doubles}
            roster={roster}
            onChange={setDoubles}
          />
          <p className="text-micro" style={{ color: "var(--ink-500)" }}>
            an entry is a player in a draw — where they start, not what
            they&rsquo;ll play. Qualifying, consolation and draw moves are
            handled per result.
          </p>
        </div>
      </div>
    </EventShell>
  );
}
