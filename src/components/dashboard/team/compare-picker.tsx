"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ComparablePlayer } from "@/lib/data/team-compare-server";

/**
 * The two selects that decide who is being compared.
 *
 * State lives in the URL rather than in the component, so a coach can send
 * "look at these two" to an assistant as a link. That is the whole reason this
 * is a picker writing search params instead of local state: the screen exists
 * to be talked about.
 */
export function ComparePicker({
  players,
  leftId,
  rightId,
}: {
  players: ComparablePlayer[];
  leftId: string | null;
  rightId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(side: "a" | "b", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(side, value);
    else next.delete(side);

    // The other side is left exactly as it was, including when the same person
    // is picked twice — the page refuses that case with a sentence rather than
    // silently swapping, because a control that rearranges itself under the
    // cursor is worse than one that says no.
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        label="Player one"
        value={leftId}
        players={players}
        onChange={(value) => choose("a", value)}
      />
      <span className="text-[12px] text-[var(--ink-400)]">against</span>
      <Select
        label="Player two"
        value={rightId}
        players={players}
        onChange={(value) => choose("b", value)}
      />
    </div>
  );
}

function Select({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string | null;
  players: ComparablePlayer[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] min-w-[190px] cursor-pointer rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-2.5 text-[13px] text-[var(--ink-900)] outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-ring-40)]"
      >
        <option value="">Choose someone</option>
        {players.map((player) => (
          <option key={player.userId} value={player.userId}>
            {player.name} ({player.matchCount})
          </option>
        ))}
      </select>
    </label>
  );
}
