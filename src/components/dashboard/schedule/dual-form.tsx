"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { OpponentPicker } from "@/components/dashboard/schedule/opponent-picker";
import {
  LineupEditor,
  type LineupLine,
} from "@/components/dashboard/schedule/lineup-editor";
import {
  FieldRow,
  FieldCellSelect,
  FieldCellText,
} from "@/components/dashboard/schedule/field-row";
import { createDual } from "@/lib/schedule/actions";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventSite } from "@/lib/schedule/types";

const SINGLES_SLOTS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const DOUBLES_SLOTS = ["D1", "D2", "D3"];

const SITES = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

const SURFACES = ["Hard", "Clay", "Grass", "Indoor hard", "Carpet"].map(
  (surface) => ({ value: surface, label: surface })
);

const FORMATS = [
  { value: "3|false", label: "Best of 3 · no-ad" },
  { value: "3|true", label: "Best of 3 · ad" },
  { value: "1|false", label: "One set · no-ad" },
  { value: "1|true", label: "One set · ad" },
];

/**
 * 25b — the new dual.
 *
 * Creating this writes nine LINES, not nine matches. The design's footer says
 * "creates 9 matches"; taken literally that puts nine scoreless rows into
 * /dashboard/matches, which is scoped by created_by and so is the coach's own
 * list, and into every statistic computed from it. A line becomes a match when
 * somebody records how it went — the same rule the tournament rail states out
 * loud.
 */
export function DualForm({
  ourName,
  ladder,
  defaultSurface,
}: {
  ourName: string;
  ladder: LadderPlayer[];
  defaultSurface: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [site, setSite] = useState<EventSite>("home");
  const [surface, setSurface] = useState(defaultSurface || "Hard");
  const [format, setFormat] = useState("3|false");

  const [lines, setLines] = useState<LineupLine[]>(() => seedLineup(ladder));

  // Whoever the ladder offered but the lineup does not currently name. Recomputed
  // from the lines rather than tracked separately, so a player dragged out of S4
  // is back on the bench without a second piece of state to keep in step.
  const bench = useMemo(() => {
    const named = new Set(
      lines.flatMap((line) => line.ourLabels.map((label) => label.toLowerCase()))
    );
    return ladder.filter((player) => !named.has(player.name.toLowerCase()));
  }, [lines, ladder]);

  const filled = lines.filter(
    (line) => line.ourLabels.length > 0 && line.theirLabels.length > 0
  );

  function submit() {
    setError(null);
    const [bestOf, adScoring] = format.split("|");

    startTransition(async () => {
      const result = await createDual({
        opponent,
        date,
        site,
        surface,
        bestOf: Number(bestOf),
        adScoring: adScoring === "true",
        lines: filled.map((line, index) => ({
          discipline: line.discipline,
          slot: line.slot,
          position: index,
          playerUserIds: line.ourIds,
          playerLabels: line.ourLabels,
          opponentLabels: line.theirLabels,
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
      crumb="New dual"
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
              Creates <span className="tabular">{filled.length}</span>{" "}
              {filled.length === 1 ? "line" : "lines"}, every line named — video
              comes later
            </span>
          )}
          <button
            type="button"
            disabled={pending || filled.length === 0 || !opponent.trim()}
            className={advButton("primary", "md")}
            onClick={submit}
          >
            {pending ? "Creating…" : "Create dual"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <span className="eyebrow">New dual · opponent</span>
          <OpponentPicker value={opponent} onChange={setOpponent} />
          <FieldRow>
            <FieldCellText label="Date" value={date} onChange={setDate} type="date" mono />
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
            <FieldCellSelect
              label="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
            />
          </FieldRow>
          <p className="text-micro mt-3" style={{ color: "var(--ink-500)" }}>
            Your program defaults for site, surface and format — edit any before
            create.
          </p>
        </div>

        <div>
          <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
            <span className="eyebrow">Lineup · singles</span>
            <span className="text-micro" style={{ color: "var(--ink-500)" }}>
              {ladder.some((player) => player.ladderPosition !== null)
                ? "filled from your ladder"
                : "type a name on each court"}
            </span>
          </div>
          <LineupEditor
            lines={lines}
            bench={bench}
            onChange={setLines}
            ourName={ourName}
            theirName={opponent}
          />
        </div>
      </div>
    </EventShell>
  );
}

/**
 * Six singles and three doubles, seeded from the ladder where there is one.
 *
 * A program with no ladder gets nine empty courts rather than an invented
 * order: roster join order is not a ranking, and printing it as S1–S6 would be
 * the form claiming to know something nobody told it.
 */
function seedLineup(ladder: LadderPlayer[]): LineupLine[] {
  const singles = SINGLES_SLOTS.map((slot, index) => {
    const player = ladder[index];
    return {
      key: slot,
      slot,
      discipline: "singles" as const,
      ourIds: player ? [player.userId] : [],
      ourLabels: player ? [player.name] : [],
      theirLabels: [],
    };
  });

  const doubles = DOUBLES_SLOTS.map((slot, index) => {
    const pair = ladder.slice(index * 2, index * 2 + 2);
    return {
      key: slot,
      slot,
      discipline: "doubles" as const,
      ourIds: pair.map((player) => player.userId),
      ourLabels: pair.map((player) => player.name),
      theirLabels: [],
    };
  });

  return [...singles, ...doubles];
}
