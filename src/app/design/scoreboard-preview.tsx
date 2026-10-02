import { RailScoreboard } from "@/components/dashboard/matches/match-detail/rail-scoreboard";

type Players = React.ComponentProps<typeof RailScoreboard>["players"];

/**
 * Emon's 7-6(5) second set: Eli lost it, so the 5 hangs off Eli's 6. `open`
 * leaves the last set unfinished (Eli 2, Emon 3) and bolds nothing in it.
 */
function emonEli(open: boolean): Players {
  return [
    {
      id: "you",
      name: "Eli Stephenson",
      sets: open ? [6, 6, 2] : [6, 6, 6],
      tiebreaks: [null, 5, null],
      lostSets: [false, true, false],
      wonSets: [true, false, !open],
      won: !open,
    },
    {
      id: "opp",
      name: "Emon van Loben Sels",
      sets: open ? [3, 7, 3] : [3, 7, 4],
      tiebreaks: [null, null, null],
      lostSets: [true, false, !open],
      wonSets: [false, true, false],
      won: false,
    },
  ];
}

const STATES: readonly {
  label: string;
  props: React.ComponentProps<typeof RailScoreboard>;
}[] = [
  {
    label: "Final — every set's winner is bold",
    props: {
      status: "final",
      label: "Final",
      duration: "2:30:11",
      caption: "Match complete · 191 points tagged",
      players: emonEli(false),
    },
  },
  {
    label: "Unfinished — completed sets bold, the open set none",
    props: {
      status: "final",
      label: "Unfinished",
      duration: "1:12:40",
      caption: "Unfinished · 88 points tagged",
      players: emonEli(true),
    },
  },
];

export function ScoreboardPreview() {
  return (
    <section id="scoreboard" className="mt-16">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
        Rail scoreboard — winner weight
      </h2>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        The winner of each completed set prints bold, the loser&apos;s digit
        stays regular; the open last set of an unfinished match bolds neither.
        Fixed inputs, drawn in the 300px rail.
      </p>
      <div className="mt-6 flex flex-wrap gap-10">
        {STATES.map((s) => (
          <div key={s.label} className="w-[300px]">
            <p className="mb-3 text-[11px] text-[var(--ink-500)]">{s.label}</p>
            <div className="rounded-[10px] border border-[var(--border-card)] bg-[var(--surface-card)]">
              <RailScoreboard {...s.props} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
