"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import {
  EntryList,
  RosterRail,
  type DraftEntry,
} from "@/components/dashboard/schedule/entry-editor";
import {
  FieldRow,
  FieldCellSelect,
  FieldCellText,
} from "@/components/dashboard/schedule/field-row";
import { createTournament } from "@/lib/schedule/actions";
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

/**
 * 3c — the new tournament, as master and detail.
 *
 * The roster on the left feeds the entries on the right, the same shape the
 * dual builder uses. Entering someone is one click on the row that already
 * shows their ladder spot, and that row then reports the entry back, so the
 * question "who is going" is answered in the place it is asked.
 *
 * The rail is the fast path, not the only one. Each entries section keeps a
 * typed-name field beside it, because a field is not always a roster: a
 * walk-on, a guest, or a recruit whose invite has not landed yet has no rail
 * row to click, and a builder that can only offer rostered players cannot
 * enter them at all. Doubles has its own section for the same reason a pair is
 * one entry rather than two — "Brooks / Reid" is a single line in a single
 * draw, and the " / " label is how it survives the round trip.
 *
 * The design also draws an info callout — "3 Big Ten programs are in this
 * field". It is not built, and should not be: nothing in this app records which
 * programs attend a tournament, so the sentence cannot be computed from
 * anything we hold. A hardcoded one would be a confident lie about a field
 * nobody entered.
 */
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

  /**
   * Everything the footer counts and the action writes, singles first.
   *
   * Two sections on screen, one field underneath. `position` is the index in
   * THIS array rather than in either list, so the two sections cannot both
   * claim position 0 and collide once they are rows in one table.
   */
  const entries = [...singles, ...doubles];

  /**
   * One click in and out of the singles field. The player id is the entry key,
   * which is what makes the rail's check and the list's row the same fact
   * rather than two lists that have to be kept in step.
   *
   * Scoped to singles deliberately. The rail's state line is about a singles
   * draw, and a click that could delete a doubles pair — a whole other entry,
   * with a second player's name on it — would be a destructive act dressed up
   * as a checkbox. Someone playing both draws therefore still shows a plus
   * here until their singles entry exists, which is the honest answer to what
   * the click is about to do.
   */
  function toggle(player: LadderPlayer) {
    setSingles((current) =>
      current.some((entry) => entry.userIds.includes(player.userId))
        ? current.filter((entry) => !entry.userIds.includes(player.userId))
        : [
            ...current,
            {
              key: player.userId,
              discipline: "singles" as const,
              labels: [player.name],
              userIds: [player.userId],
              draw: "Main draw",
              seed: "",
            },
          ]
    );
  }

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
        entries: entries.map((entry, index) => ({
          discipline: entry.discipline,
          position: index,
          draw: entry.draw,
          seed: entry.seed ? Number(entry.seed) : null,
          playerUserIds: entry.userIds,
          playerLabels: entry.labels,
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
      flush
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
              Creates <span className="tabular">{entries.length}</span>{" "}
              {entries.length === 1 ? "entry" : "entries"} and no matches — a
              match exists once it&rsquo;s played
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
      {/* Singles only — the rail toggles what it reports, and what it reports
          is the singles draw. */}
      <RosterRail roster={roster} entries={singles} onToggle={toggle} />

      <div className="flex min-w-0 flex-1 flex-col gap-[22px] overflow-y-auto px-8 py-6">
        <div>
          <span className="eyebrow">Tournament · name</span>
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
              label="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
            />
          </FieldRow>
          {/* Surface and host arrive already answered from the program's
              settings, so they sit under the four the design draws rather than
              displacing one of them. Dropping either would leave the event
              without a surface the vision pipeline can read. */}
          <FieldRow>
            <FieldCellSelect
              label="Surface"
              value={surface}
              options={SURFACES}
              onChange={setSurface}
            />
            <FieldCellText label="Hosted by" value={host} onChange={setHost} />
          </FieldRow>
        </div>

        <EntryList
          discipline="singles"
          entries={singles}
          roster={roster}
          onChange={setSingles}
        />

        <div>
          <EntryList
            discipline="doubles"
            entries={doubles}
            roster={roster}
            onChange={setDoubles}
          />
          {/* One note under both sections, not one per section: it defines
              what an entry IS, which is the same fact in either draw, and
              printing it twice would read as two different rules. */}
          <p className="text-micro mt-2.5" style={{ color: "var(--ink-500)" }}>
            An entry is a player in a draw — where they start, not what
            they&rsquo;ll play.
          </p>
        </div>
      </div>
    </EventShell>
  );
}
