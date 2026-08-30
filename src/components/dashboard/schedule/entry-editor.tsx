"use client";

import { useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import { rosterIdsForLabels } from "@/lib/schedule/roster-match";
import type { LadderPlayer } from "@/lib/data/roster-server";

export interface DraftEntry {
  key: string;
  discipline: "singles" | "doubles";
  labels: string[];
  userIds: string[];
  draw: string;
  seed: string;
}

/**
 * Where an entry can start, and nowhere else.
 *
 * Consolation and the flights are not offered here because they are not places
 * a coach enters anyone — a player arrives in consolation by losing, and that
 * move is recorded per result on the event page. Offering them at creation
 * would let a weekend be described before it happened.
 */
const DRAWS = ["Main draw", "Qualifying"];

const ROW = "grid grid-cols-[1fr_120px_96px_24px] items-center gap-3";

/**
 * What each section is called, and what a typed name looks like in it.
 *
 * Both disciplines render the same list; only the wording and the shape of a
 * typed name differ. A doubles pair is ONE entry whose label carries both
 * names joined by " / " — `splitNames` is the other half of that convention,
 * which is why the pair field asks for "Name / Name" rather than offering two
 * fields that would have to be re-joined to mean anything.
 */
const SECTION = {
  singles: {
    title: "Entries · singles",
    hint: "from the roster, or typed",
    addLabel: "Add a name",
    placeholder: "Name",
    empty: "Nobody yet — add players from the roster, or type a name.",
  },
  doubles: {
    title: "Entries · doubles",
    hint: "one entry per pair",
    addLabel: "Add a pair",
    placeholder: "Name / Name",
    empty: "No pairs yet — type both names, like Brooks / Reid.",
  },
} as const;

/**
 * The state line under a roster name — their ladder spot, then what entering
 * them did. It is the rail's whole feedback loop: the same row that adds a
 * player is the row that reports the entry back, so a coach never has to look
 * right to see whether the click landed.
 */
function stateLine(player: LadderPlayer, entry: DraftEntry | undefined): string {
  // `null` is "the program has never set one" — see getLadder. Printing an
  // invented S-number would put a ladder on screen that nobody decided.
  const spot =
    player.ladderPosition !== null ? `S${player.ladderPosition}` : "Unranked";
  if (!entry) return spot;
  if (entry.draw === "Qualifying") return `${spot} · qualifying`;
  return entry.seed ? `${spot} · entered · seed ${entry.seed}` : `${spot} · entered`;
}

/**
 * 3c's left rail — the roster, and one click to put someone in the field.
 *
 * The field is built from the roster rather than typed, which is what makes
 * every entry carry a `program_players.id` instead of a name that has to be
 * matched back later. A tournament entry is a player in a draw; the player has
 * to be a player we know.
 */
export function RosterRail({
  roster,
  entries,
  onToggle,
}: {
  roster: LadderPlayer[];
  entries: DraftEntry[];
  onToggle: (player: LadderPlayer) => void;
}) {
  const [query, setQuery] = useState("");

  const entered = new Map<string, DraftEntry>();
  for (const entry of entries) {
    for (const id of entry.userIds) entered.set(id, entry);
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? roster.filter((player) => player.name.toLowerCase().includes(needle))
    : roster;

  return (
    <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-[var(--border-hairline)]">
      <div className="shrink-0 px-5 pb-3 pt-[18px]">
        <span className="eyebrow">Roster</span>
        <label className="mt-2.5 flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5">
          <Search
            strokeWidth={1.5}
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Add a player to the field"
            aria-label="Add a player to the field"
            className="w-full min-w-0 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-600)]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {shown.length === 0 ? (
          <p className="text-micro px-2.5 py-2" style={{ color: "var(--ink-500)" }}>
            {roster.length === 0
              ? "No players on the roster yet."
              : "No player by that name."}
          </p>
        ) : null}

        {shown.map((player) => {
          const entry = entered.get(player.userId);
          return (
            <button
              key={player.userId}
              type="button"
              aria-pressed={Boolean(entry)}
              onClick={() => onToggle(player)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] p-2.5 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[13px] text-[var(--ink-900)] ${entry ? "font-medium" : ""}`}
                >
                  {player.name}
                </span>
                <span
                  className="text-micro mt-0.5 block truncate"
                  style={{ color: "var(--ink-600)" }}
                >
                  {stateLine(player, entry)}
                </span>
              </span>
              {entry ? (
                <Check
                  strokeWidth={1.5}
                  className="size-[13px] shrink-0 text-[var(--blue)]"
                />
              ) : (
                <Plus
                  strokeWidth={1.5}
                  className="size-3.5 shrink-0 text-[var(--ink-400)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 3c's entry list — who is going, and where they start.
 *
 * An entry is a player in a draw, not a match. Nothing here creates a fixture:
 * a tournament match exists once it is played, which is why the footer promises
 * entries and no matches. Draw moves — qualifying into the main draw, a loss
 * into consolation — are recorded per result on the event page rather than by
 * editing the entry, because a run through two draws is one player's weekend
 * and not two entries.
 *
 * A row's name is not editable in place; the rail and the add field own who is
 * in, and the `x` takes them back out. Retyping a name over an entry that
 * already carries a roster id is exactly how a match gets attributed to the
 * wrong athlete, so the correction is remove-and-re-add rather than an edit
 * that silently keeps the old id.
 */
export function EntryList({
  discipline,
  entries,
  roster,
  onChange,
}: {
  discipline: DraftEntry["discipline"];
  entries: DraftEntry[];
  /** For the typed path: the datalist, and the ids a typed name resolves to. */
  roster: LadderPlayer[];
  onChange: (entries: DraftEntry[]) => void;
}) {
  const [editingSeed, setEditingSeed] = useState<string | null>(null);
  /** The typed-name draft, or null when the field is closed. */
  const [typed, setTyped] = useState<string | null>(null);
  // Escape has to beat the blur that follows it. Without this the field
  // commits the very name the coach just asked it to throw away.
  const cancelled = useRef(false);

  const section = SECTION[discipline];
  const listId = `schedule-roster-${discipline}`;

  function update(key: string, patch: Partial<DraftEntry>) {
    onChange(
      entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    );
  }

  /**
   * Enter a typed name — the walk-on path, and the only way in for anyone the
   * rail cannot offer.
   *
   * The rail is built from the roster, so a guest, a walk-on, or a recruit
   * whose invite has not been accepted yet has no row to click. Typing is how
   * they are entered at all. `rosterIdsForLabels` then decides whether the
   * name is somebody we already know — exactly, on case and whitespace only,
   * never on a near-miss — and a name matching nobody contributes NO id while
   * the entry still records the label. That is the whole trick: an unrostered
   * player is enterable, and a rostered one still arrives carrying the
   * `program_players.id` their match will be attributed to.
   *
   * `splitNames` runs here rather than per keystroke, which is its documented
   * boundary — trimming as the coach types eats the space they just pressed,
   * and "Dana Brooks" becomes unspellable.
   */
  function add(raw: string) {
    const labels = splitNames(raw);
    if (labels.length === 0) return;

    // One person, one entry per draw. A second row for a name already in this
    // section would enter them twice and inflate the count the footer promises.
    const already = entries.some(
      (entry) =>
        normalizedPersonName(entry.labels.join(" / ")) ===
        normalizedPersonName(labels.join(" / "))
    );
    if (already) return;

    onChange([
      ...entries,
      {
        key: `${discipline}-typed-${Date.now()}-${entries.length}`,
        discipline,
        labels,
        userIds: rosterIdsForLabels(raw, roster),
        draw: "Main draw",
        seed: "",
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-[9px]">
        <span className="eyebrow">{section.title}</span>
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          {section.hint}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setTyped("")}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[var(--blue-text)]"
        >
          <Plus strokeWidth={2} className="size-3" />
          {section.addLabel}
        </button>
      </div>

      {typed !== null ? (
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] py-[9px]">
          <span className="h-3 w-0.5 shrink-0 bg-[var(--blue)]" />
          <input
            autoFocus
            list={listId}
            value={typed}
            placeholder={section.placeholder}
            aria-label={section.addLabel}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(typed);
                // Cleared, not closed: a coach entering a field enters
                // several, and reopening the row for each one is a click per
                // player for nothing.
                setTyped("");
              } else if (event.key === "Escape") {
                cancelled.current = true;
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              // Commit on the way out rather than discard. A name typed and
              // then abandoned for the Create button would otherwise vanish
              // with nothing on screen to say it had gone.
              if (!cancelled.current) add(typed);
              cancelled.current = false;
              setTyped(null);
            }}
            className="w-full min-w-0 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
          />
        </div>
      ) : null}

      {entries.length === 0 && typed === null ? (
        <p className="text-micro py-3" style={{ color: "var(--ink-500)" }}>
          {section.empty}
        </p>
      ) : null}

      <div className="mt-1 flex flex-col">
        {entries.map((entry, index) => {
          const who = entry.labels.join(" / ");
          return (
            <div
              key={entry.key}
              className={`${ROW} py-[9px] ${index < entries.length - 1 ? "border-b border-[var(--border-hairline)]" : ""}`}
            >
              <span className="truncate text-[13px] text-[var(--ink-900)]">
                {who}
              </span>

              <select
                aria-label={`Draw for ${who}`}
                value={entry.draw}
                onChange={(event) =>
                  update(entry.key, {
                    draw: event.target.value,
                    // A qualifier is not seeded, and the row says so with a
                    // dash. Keeping a seed alive behind that dash would send a
                    // number nobody could see.
                    seed: event.target.value === "Qualifying" ? "" : entry.seed,
                  })
                }
                className="w-full cursor-pointer bg-transparent text-[12px] text-[var(--ink-600)] outline-none"
              >
                {DRAWS.map((draw) => (
                  <option key={draw} value={draw}>
                    {draw}
                  </option>
                ))}
              </select>

              {entry.draw === "Qualifying" ? (
                <span className="mono text-[11px]" style={{ color: "var(--ink-400)" }}>
                  —
                </span>
              ) : editingSeed === entry.key ? (
                <input
                  autoFocus
                  value={entry.seed}
                  inputMode="numeric"
                  placeholder="seed"
                  aria-label={`Seed for ${who}`}
                  onChange={(event) =>
                    update(entry.key, {
                      seed: event.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                  onBlur={() => setEditingSeed(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      event.currentTarget.blur();
                    }
                  }}
                  className="mono tabular w-full bg-transparent text-[11px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Seed for ${who}`}
                  onClick={() => setEditingSeed(entry.key)}
                  className="mono tabular cursor-pointer text-left text-[11px]"
                  style={{
                    color: entry.seed ? "var(--ink-600)" : "var(--ink-400)",
                  }}
                >
                  {entry.seed ? `Seed ${entry.seed}` : "Unseeded"}
                </button>
              )}

              <button
                type="button"
                aria-label={`Remove ${who}`}
                onClick={() =>
                  onChange(entries.filter((other) => other.key !== entry.key))
                }
                className="cursor-pointer justify-self-end text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--danger)]"
              >
                <X strokeWidth={1.5} className="size-[13px]" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Roster names, offered to the typed field so a coach spelling one lands
          on the exact string `rosterIdsForLabels` compares against. Ids come
          from that comparison, never from the datalist — picking a suggestion
          and typing the same letters have to mean the same thing. */}
      <datalist id={listId}>
        {roster.map((player) => (
          <option key={player.userId} value={player.name} />
        ))}
      </datalist>
    </div>
  );
}
