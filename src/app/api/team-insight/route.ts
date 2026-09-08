import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getTeamHomeData,
  insightCardsFrom,
  type TeamHomeData,
} from "@/lib/data/team-home-server";
import { getTopKpiMovers } from "@/lib/data/performance-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { getLLMStream } from "@/lib/llm/adapter";
import { formatChange, textStreamResponse } from "@/lib/llm/stream-response";

/**
 * The Focus card's claim, for a program — Team Home's counterpart to
 * `/api/home-insight`.
 *
 * Same contract as the personal route: one sentence, no digits, streamed as
 * plain text; 204 when there is nothing measured to make a claim about. The
 * difference is the subject. This reads the active **workspace**, not the
 * viewer — the numbers are the squad's, and a coach who also plays must get
 * the program's claim here and their own on `/dashboard`.
 *
 * Nothing in the request body is trusted, because nothing in it is read: the
 * program comes from the workspace cookie through `getWorkspaceContext()`,
 * which already proved membership, and every figure is recomputed server-side
 * by the same loader the page rendered from.
 */

function buildTeamInsightSystemPrompt(data: TeamHomeData, program: string): string {
  const { dualForm, kpiCards, movers, kpiMatchCount } = data;

  const formText =
    dualForm.form.length > 0
      ? dualForm.form.map((r) => (r === "win" ? "W" : "L")).join(" ")
      : "No dual decided yet.";

  // The same pick the strip's picker and the personal route make, so the
  // claim is drawn from the cards a coach can see move.
  // The signed change alone, with no "improving"/"declining" word. The
  // season catalogue carries no lower-is-better flag — `ProfileKpi` has
  // nowhere to put one — so naming a direction here would read a rising
  // double-fault count as improvement the day such a tile joins the
  // catalogue, silently and in the model's own voice.
  const kpiText = getTopKpiMovers(insightCardsFrom(kpiCards), 5)
    .map((k) => `  - ${k.label}: ${k.value} (${formatChange(k.change)} ${k.changeLabel})`)
    .join("\n");

  const moversText = movers
    .slice(0, 5)
    .map((m) => `  - ${m.name}: ${m.metric} ${m.value}% (${formatChange(m.delta)})`)
    .join("\n");

  return `You write the claim line on the Focus card of Advantage, a tennis analytics platform, for the coaching staff of a collegiate program.

Program: ${program}
Dual matches analyzed this season: ${kpiMatchCount}
Dual record: ${dualForm.wins}W-${dualForm.losses}L
Dual form (oldest → newest): ${formText}

Squad averages that moved most, against earlier in the season:
${kpiText || "  No notable movement yet."}

Players whose numbers moved most since last week:
${moversText || "  Nobody has enough matches to show a change yet."}

Write ONE sentence: the single most important thing this data says about the squad.

The rules below are the product's voice, not style preferences. Breaking one is a defect.

- ONE sentence, at most 8 words. A headline, not a paragraph.
- Make a falsifiable CLAIM about what the data shows — not advice, not encouragement.
  Good: "Second serves are costing the bottom of the lineup."
  Bad: "Keep the squad working on second serves!"
- NO digits, percentages, counts or ordinals. A separate evidence line directly
  beneath yours carries every number, computed from the database. A number you
  write is a number nobody verified — so write none.
- About the squad, in the third person, present tense. Name a player only if
  the claim is genuinely about that one player.
- No greeting, no markdown, no bullet points, no emoji, no quotation marks.
- NO exclamation marks. No cheerleading, praise, encouragement or motivation.
  These readers are coaches reading a training-room instrument.
- If the sample is thin, say what is thin rather than inflating it — a claim
  drawn from one or two matches must read as provisional.

Return the sentence alone, with no surrounding text.`;
}

export async function POST() {
  const workspace = await getWorkspaceContext();
  if (!workspace) return new Response("Unauthorized", { status: 401 });

  const { active } = workspace;
  // A personal workspace has no squad to make a claim about; the personal
  // card asks `/api/home-insight`. 404 rather than 401 — the viewer is
  // signed in, there is simply no such resource for them here.
  if (active.kind !== "team") return new Response("Not a program", { status: 404 });

  const data = await getTeamHomeData(active.id, currentBillingMonth(), active.orgType);

  // Nothing analyzed, no claim — the same 204 the personal route answers with,
  // and the same reason: the card's own render gate decides whether there are
  // figures worth showing, this only refuses to invent a judgement.
  if (data.kpiMatchCount === 0 || !data.insight) {
    return new Response(null, { status: 204 });
  }

  let iterable: AsyncIterable<string>;
  try {
    iterable = await getLLMStream(buildTeamInsightSystemPrompt(data, active.name), [
      { role: "user", content: "Generate the program's insight." },
    ]);
  } catch (err) {
    console.error("LLM adapter error:", err);
    return new Response("LLM error", { status: 500 });
  }

  return textStreamResponse(iterable);
}
