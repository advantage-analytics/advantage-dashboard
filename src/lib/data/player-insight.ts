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
 * The card has the match report's anatomy (`report-insight-card.tsx`): a
 * CLAIM — one sentence, no digits — and under it a DESCRIPTION on the same
 * subject, two sentences that quote the figures the claim rests on. The model
 * still never types a number that is shown. It cites a figure by its key
 * (`{F3}`) from the table the prompt lists (`seasonFigures`), and
 * `resolvePlayerInsight` swaps each key for the fold's own display text. A
 * description with a bare digit, an unknown key or no key at all is dropped,
 * and the card falls back to the computed line `buildSeasonEvidence` writes,
 * so every figure on screen is one the fold produced. Nothing here derives a
 * statistic either; it reads the rows the fold already finished.
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

/* ── Figures the description may cite ─────────────────────────────── */

/** One citable figure: its key, what it names, and the fold's display text. */
export interface SeasonFigure {
  /** `F1`, `F2`… — the model writes `{F1}`, never the value. */
  key: string;
  /** "First serve in — Maya", "Aces — opponents (per match)". */
  label: string;
  /** The fold's display text, exactly as the Head to head card prints it. */
  display: string;
}

/**
 * Every figure the season has, keyed in a stable order: the analyzed count,
 * then each Head to head row with a figure, the player's side before their
 * opponents'. A side with no figure (`display === ""`) gets no key, so the
 * model cannot cite a dash.
 */
export function seasonFigures(
  analyzed: number,
  groups: readonly SeasonGroup[],
  firstName: string,
): SeasonFigure[] {
  const figures: SeasonFigure[] = [];
  const add = (label: string, display: string) => {
    if (display === "") return;
    figures.push({ key: `F${figures.length + 1}`, label, display });
  };
  add("Matches analyzed", String(analyzed));
  for (const group of groups) {
    for (const row of group.rows) {
      const unit = row.kind === "count" ? " (per match)" : "";
      add(
        `${group.title} · ${row.label} — ${firstName}${unit}`,
        row.you.display,
      );
      // Whose figure it is, spelled out: "opponents" alone read as what the
      // player conceded ("conceding 53% to opponents") in a live sample.
      add(
        `${group.title} · ${row.label} — their opponents' own figure${unit}`,
        row.opp.display,
      );
    }
  }
  return figures;
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

function figuresText(figures: readonly SeasonFigure[]): string {
  return figures.map((f) => `  {${f.key}} ${f.label}: ${f.display}`).join("\n");
}

/**
 * The system prompt for the profile's card — `/api/home-insight`'s voice
 * rules over the season fold's figures, in the match report's two parts.
 * The CLAIM's rules are the product's, not style: one sentence of at most
 * eight words, a falsifiable claim, NO digits, no cheerleading. The
 * DESCRIPTION (the report summary's description: same subject, figures, then
 * what it means for training) cites figures only by key — `resolvePlayerInsight`
 * fills them in and drops a description that types a digit itself. The
 * subject is a named player read about by themself and their coaches, so both
 * are third person; nobody here knows the player's pronouns, so they use the
 * first name or "they".
 *
 * The figures are ALL-TIME — every match of theirs the program recorded
 * (`getPlayerMatchSides`), not one academic season — and the rail's "N
 * matches" counts the same set, so the prompt never says "this season".
 */
export function buildPlayerInsightPrompt(input: PlayerInsightInput): string {
  const { name, firstName, matchesPlayed, analyzed, groups, tallies } = input;
  const figures = seasonFigures(analyzed, groups, firstName);
  return `You write the Advantage Intelligence card on a player's profile on Advantage, a tennis analytics platform for collegiate programs. The page is read by the player and by their coaching staff.

Player: ${name}
Matches recorded: ${matchesPlayed}
Matches analyzed (every figure below comes from these): ${analyzed}
Points won per analyzed match (oldest → newest): ${pointsWonLine(tallies.perMatch)}

Figures over every analyzed match on record — ${firstName} against their opponents. They span every season on record, not one, so never present them as a single season's. A count is the per-match average; a rate is pooled over every point of the analyzed matches.
${groupsText(groups, firstName)}

Citable figures — the ONLY way to put a number in your description is to write its key in braces, exactly as listed. The key is replaced by the figure shown beside it.
${figuresText(figures)}

Write TWO lines and nothing else.

LINE 1 — the claim: ONE sentence, the single most important thing this data says about ${firstName}'s game across these matches.
LINE 2 — the description: exactly two sentences on the SAME subject as the claim. The first backs the claim with one to three cited figures, usually ${firstName}'s against the opponents'. The second says what that means for ${firstName}'s training or match play, plainly and concretely.

The rules below are the product's voice, not style preferences. Breaking one is a defect.

- The claim is ONE sentence, at most 8 words. A headline, not a paragraph.
- Make a falsifiable CLAIM about what the data shows — not advice, not encouragement.
  Good: "Second serves are deciding ${firstName}'s losses."
  Bad: "Keep working on that second serve!"
- NO digits, percentages, counts or ordinals anywhere you type them, in either
  line. The claim carries no figures at all. The description puts a figure in
  ONLY by its key — write "{F3}", never the number beside it. A number you type
  is a number nobody verified, and a description that types one is thrown away.
- Cite a count figure as a per-match average ("{F5} aces per match"). Cite only
  keys from the list; never invent one.
- Both lines stay on one subject. No "but", "however" or "meanwhile" pivot to a
  second area of the game.
- About ${firstName}, in the third person, present tense. Call them ${firstName}
  or "they"; never a gendered pronoun.
- No greeting, no markdown, no bullet points, no emoji, no quotation marks, no
  labels such as "Claim:".
- NO exclamation marks. No cheerleading, praise, encouragement or motivation.
  Never "great start", "keep it up", "on a roll", "build on this". These
  readers are competitive athletes and their coaches reading a training-room
  instrument, not a consumer fitness app.
- If the sample is thin, say what is thin rather than inflating it — a claim
  drawn from one or two matches must read as provisional.

Return the two lines alone, separated by a single line break, with no surrounding text.`;
}

/* ── Reading the answer ───────────────────────────────────────────────── */

/** What the card shows: the claim, and the description with its figures. */
export interface PlayerInsight {
  claim: string;
  /** Figures set tabular; `null` when the description failed a check. */
  description: EvidencePart[] | null;
}

/** The longest description kept, after its figures are filled in. */
const DESCRIPTION_MAX_CHARS = 420;

const KEY_PATTERN = /\{(F\d+)\}/g;

/** Strip a label or wrapping quotes the model added despite the rules. */
function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^(claim|line\s*[12]|description)\s*[:—-]\s*/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
}

function sentenceCount(text: string): number {
  return text.split(/(?<=[.?])\s+/).filter((s) => s.trim() !== "").length;
}

/**
 * The description with every `{Fn}` swapped for the fold's display text, or
 * `null` when it fails a check: a digit typed outside a key, a key the table
 * does not hold, no key at all, an exclamation mark, more than three
 * sentences, or longer than `DESCRIPTION_MAX_CHARS`.
 */
function resolveDescription(
  raw: string,
  figures: readonly SeasonFigure[],
): EvidencePart[] | null {
  if (raw === "" || raw.includes("!")) return null;
  if (/\d/.test(raw.replace(KEY_PATTERN, ""))) return null;
  const byKey = new Map(figures.map((f) => [f.key, f.display]));
  const parts: EvidencePart[] = [];
  let last = 0;
  let cited = 0;
  for (const m of raw.matchAll(KEY_PATTERN)) {
    const display = byKey.get(m[1]);
    if (display === undefined) return null;
    if (m.index > last) parts.push({ text: raw.slice(last, m.index) });
    parts.push({ text: display, tabular: true });
    last = m.index + m[0].length;
    cited += 1;
  }
  if (cited === 0) return null;
  if (last < raw.length) parts.push({ text: raw.slice(last) });
  const text = parts.map((p) => p.text).join("");
  if (text.length > DESCRIPTION_MAX_CHARS || sentenceCount(text) > 3)
    return null;
  return parts;
}

/**
 * The model's two lines as the card shows them (a one-line answer splits at
 * its first sentence), or `null` when there is no claim to show — an empty
 * answer, or a claim that typed a digit (a figure nobody verified, in the
 * one line that must carry none). A description that
 * fails its checks is dropped on its own: the claim stands, and the card
 * prints the computed evidence line in its place.
 */
export function resolvePlayerInsight(
  raw: string,
  figures: readonly SeasonFigure[],
): PlayerInsight | null {
  let lines = raw
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l !== "");
  // The model sometimes runs both parts into one line. The claim is its first
  // sentence, so split there rather than read the whole answer as a claim
  // (which would carry the description's keys and be refused).
  if (lines.length === 1) {
    const [first, ...rest] = lines[0].split(/(?<=[.?])\s+/);
    lines = [first, rest.join(" ")];
  }
  const claim = lines[0] ?? "";
  // A cited key carries a digit, so this also refuses a claim that cites one.
  if (claim === "" || /\d/.test(claim)) return null;
  const description = resolveDescription(lines.slice(1).join(" "), figures);
  return { claim, description };
}
