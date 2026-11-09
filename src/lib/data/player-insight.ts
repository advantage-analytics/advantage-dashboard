import type { EvidencePart } from "@/lib/ui/insight-evidence";
import type {
  SeasonGroup,
  SeasonPerMatch,
  SeasonRow,
  SeasonTallies,
} from "@/lib/data/player-season";

/**
 * The season Advantage Intelligence claim on the team player profile's
 * Statistics tab (design Q): what the model is asked, what the card prints
 * beside its answer, and what tells a cached answer from a stale one. Pure —
 * `/api/player-insight` builds its prompt here, the profile page composes the
 * evidence here, and `tests/player-insight-prompt.spec.ts` pins both.
 *
 * The split is the Focus card's (`lib/ui/insight-evidence.ts`): the model
 * writes the CLAIM — one sentence, no digits — and this module writes the
 * EVIDENCE from the season fold's own figures (`foldSeasonRows`). The model
 * never types a number that is shown: a figure in the stream is a figure
 * nobody verified, so the prompt forbids them and the card prints only what
 * `buildSeasonEvidence` composed. Nothing here derives a statistic either; it
 * reads the rows the fold already finished.
 */

/* ── Evidence ─────────────────────────────────────────────────────────── */

/**
 * The rows the evidence line names, in order, and the words it names them
 * with — "points won" for the Points group's Total points won, "first serve"
 * for the Serve group's First serve in. Both are pooled rates, so one figure
 * stands for the whole season rather than an average of averages.
 */
const EVIDENCE_ROWS: readonly { label: string; words: string }[] = [
  { label: "Total points won", words: "points won" },
  { label: "First serve in", words: "first serve" },
];

export interface SeasonEvidence {
  /** The line, split so each figure can be set tabular in the darker ink. */
  parts: EvidencePart[];
  /** The same line as one string — the cache signature and the spec read it. */
  text: string;
}

function findRow(
  groups: readonly SeasonGroup[],
  label: string,
): SeasonRow | null {
  for (const group of groups) {
    const row = group.rows.find((r) => r.label === label);
    if (row) return row;
  }
  return null;
}

/**
 * "{A} analyzed · points won {x}% · first serve {y}%" — the figures under the
 * claim, read off the season fold. A row the season has no figure for (its
 * `display` is `""`, the fold's "no data") drops its clause rather than print
 * a dash in a sentence; `null` with nothing analyzed, when the card is the
 * empty state and there is no line to draw.
 */
export function buildSeasonEvidence(season: {
  /** `PlayerSeason.analyzed` — matches with points. */
  analyzed: number;
  /** `PlayerSeason.groups` — the season Head to head rows. */
  groups: readonly SeasonGroup[];
}): SeasonEvidence | null {
  if (season.analyzed === 0) return null;
  const parts: EvidencePart[] = [
    { text: String(season.analyzed), tabular: true },
    { text: " analyzed" },
  ];
  for (const { label, words } of EVIDENCE_ROWS) {
    const row = findRow(season.groups, label);
    if (!row || row.you.display === "") continue;
    parts.push(
      { text: ` · ${words} ` },
      { text: row.you.display, tabular: true },
    );
  }
  return { parts, text: parts.map((p) => p.text).join("") };
}

/**
 * What a cached claim was written about: the analyzed count, the analyzed
 * match ids and the evidence line's text. A match analysed, re-derived or
 * removed changes it, so the card asks for a fresh claim; a visit that
 * changes nothing reads the cached one (`profile-insight-card.tsx`).
 */
export function seasonInsightSignature(season: {
  analyzed: number;
  groups: readonly SeasonGroup[];
  /** `PlayerSeason.tallies` — its `perMatch` names the analyzed matches. */
  tallies: Pick<SeasonTallies, "perMatch">;
}): string {
  const ids = season.tallies.perMatch
    .map((m) => m.matchId)
    .sort()
    .join(",");
  const evidence = buildSeasonEvidence(season)?.text ?? "";
  return `${season.analyzed}:${ids}:${evidence}`;
}

/* ── The prompt ───────────────────────────────────────────────────────── */

export interface PlayerInsightInput {
  /** The player's full name, as the roster names them. */
  name: string;
  /** Their given name — the word the sentence may call them by. */
  firstName: string;
  /** Every match of theirs the program recorded, analyzed or not. */
  matchesPlayed: number;
  /** Matches with points — what every figure comes from. */
  analyzed: number;
  /** `PlayerSeason.groups`: the season Head to head rows, both columns. */
  groups: SeasonGroup[];
  /** `PlayerSeason.tallies`: the per-match points for the trend line. */
  tallies: Pick<SeasonTallies, "perMatch">;
}

/** "52% v Smith, 48% v Jones" — oldest first, as `seasonPerMatch` orders them. */
function pointsWonLine(perMatch: readonly SeasonPerMatch[]): string {
  const shares = perMatch
    .filter((m) => m.total > 0)
    .map((m) => `${Math.round((m.youWon / m.total) * 100)}% v ${m.opponent}`);
  return shares.length > 0 ? shares.join(", ") : "No point-level record yet.";
}

/**
 * One Head to head row as the prompt states it, or nothing when neither side
 * has a figure — a dash on both sides says nothing the model should weigh.
 */
function rowLine(row: SeasonRow, firstName: string): string | null {
  if (row.you.display === "" && row.opp.display === "") return null;
  const you = row.you.display || "—";
  const opp = row.opp.display || "—";
  const unit = row.kind === "count" ? " (per match)" : "";
  return `  - ${row.label}: ${firstName} ${you}, opponents ${opp}${unit}`;
}

function groupsText(groups: readonly SeasonGroup[], firstName: string): string {
  const blocks = groups
    .map((group) => {
      const rows = group.rows
        .map((row) => rowLine(row, firstName))
        .filter((line): line is string => line !== null);
      return rows.length > 0 ? [group.title, ...rows].join("\n") : null;
    })
    .filter((block): block is string => block !== null);
  return blocks.length > 0 ? blocks.join("\n") : "  No figures yet.";
}

/**
 * The system prompt for the profile's claim — `/api/home-insight`'s voice
 * rules over the season fold's figures. The rules are the product's, not
 * style: one sentence of at most eight words, a falsifiable claim, NO digits
 * (the evidence line carries every number), no cheerleading. Two things
 * differ from the personal card: the subject is a named player read about by
 * themself and their coaches, so the sentence is third person; and nobody
 * here knows the player's pronouns, so the sentence uses their first name or
 * "they".
 *
 * The figures are ALL-TIME — every match of theirs the program recorded
 * (`getPlayerMatchSides`), not one academic season — and the rail's "N
 * matches" counts the same set, so the prompt never says "this season".
 */
export function buildPlayerInsightPrompt(input: PlayerInsightInput): string {
  const { name, firstName, matchesPlayed, analyzed, groups, tallies } = input;
  return `You write the claim line on the Advantage Intelligence card of a player's profile on Advantage, a tennis analytics platform for collegiate programs. The page is read by the player and by their coaching staff.

Player: ${name}
Matches recorded: ${matchesPlayed}
Matches analyzed (every figure below comes from these): ${analyzed}
Points won per analyzed match (oldest → newest): ${pointsWonLine(tallies.perMatch)}

Figures over every analyzed match on record — ${firstName} against their opponents. They span every season on record, not one, so never present them as a single season's. A count is the per-match average; a rate is pooled over every point of the analyzed matches.
${groupsText(groups, firstName)}

Write ONE sentence: the single most important thing this data says about ${firstName}'s game across these matches.

The rules below are the product's voice, not style preferences. Breaking one is a defect.

- ONE sentence, at most 8 words. A headline, not a paragraph.
- Make a falsifiable CLAIM about what the data shows — not advice, not encouragement.
  Good: "Second serves are deciding ${firstName}'s losses."
  Bad: "Keep working on that second serve!"
- NO digits, percentages, counts or ordinals. A separate evidence line directly
  beneath yours carries every number, computed from the database. A number you
  write is a number nobody verified — so write none.
- About ${firstName}, in the third person, present tense. Call them ${firstName}
  or "they"; never a gendered pronoun.
- No greeting, no markdown, no bullet points, no emoji, no quotation marks.
- NO exclamation marks. No cheerleading, praise, encouragement or motivation.
  Never "great start", "keep it up", "on a roll", "build on this". These
  readers are competitive athletes and their coaches reading a training-room
  instrument, not a consumer fitness app.
- If the sample is thin, say what is thin rather than inflating it — a claim
  drawn from one or two matches must read as provisional.

Return the sentence alone, with no surrounding text.`;
}
