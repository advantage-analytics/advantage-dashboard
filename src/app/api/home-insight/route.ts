import { createClient } from "@/lib/supabase/server";
import { getLLMStream } from "@/lib/llm/adapter";
import {
  getOverallPerformance,
  getTopKpiMovers,
  type OverallPerformanceData,
} from "@/lib/data/performance-server";

function formatChange(change: number): string {
  if (change === 0) return "flat";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change}`;
}

function buildHomeInsightSystemPrompt(
  perf: OverallPerformanceData,
  name: string,
): string {
  const overall = perf.views[0];
  const last30 = perf.views[1];

  // Recent form, oldest → newest (matches how `calculateForm` orders it).
  const formText =
    perf.form.length > 0 ? perf.form.join(" ") : "No recent results.";

  // Top KPI movers: largest absolute non-zero change, accounting for whether
  // a lower value is better (e.g. double faults, unforced errors). Uses the same
  // selection the home card renders as chips, so prose and evidence stay aligned.
  const movers = getTopKpiMovers(perf.kpiCards, 5)
    .map((k) => {
      const improving = k.lowerIsBetter ? k.change < 0 : k.change > 0;
      return `  - ${k.label}: ${k.value} (${formatChange(k.change)} vs prior, ${
        improving ? "improving" : "declining"
      })`;
    });

  const moversText =
    movers.length > 0 ? movers.join("\n") : "  No notable stat movement yet.";

  const recentServeText = perf.recentPerformance
    .map((r) => `  - ${r.label}: ${r.value}% (${formatChange(r.change)})`)
    .join("\n");

  return `You write the claim line on the Focus card of Advantage, a tennis analytics platform for competitive players.

Player: ${name}
Matches recorded: ${perf.matchCount}
Overall record: ${overall.wins}W-${overall.losses}L
Last 30 days: ${last30.wins}W-${last30.losses}L
Win rate: ${perf.winRate.value}% (${formatChange(perf.winRate.change)} over last 30 days)
Recent form (oldest → newest): ${formText}

Biggest stat movers vs the prior period:
${moversText}

Recent serve performance:
${recentServeText}

Write ONE sentence: the single most important thing this data says.

The rules below are the product's voice, not style preferences. Breaking one is a defect.

- ONE sentence, at most 8 words. A headline, not a paragraph.
- Make a falsifiable CLAIM about what the data shows — not advice, not encouragement.
  Good: "Second serves are deciding your losses."
  Bad: "Keep working on your second serve!"
- NO digits, percentages, counts or ordinals. A separate evidence line directly
  beneath yours carries every number, computed from the database. A number you
  write is a number nobody verified — so write none.
- Second person, present tense.
- No greeting, no name, no markdown, no bullet points, no emoji, no quotation marks.
- NO exclamation marks. No cheerleading, praise, encouragement or motivation.
  Never "great start", "keep it up", "you're on a roll", "build on this".
  These readers are competitive athletes reading a training-room instrument,
  not a consumer fitness app.
- If the sample is thin, say what is thin rather than inflating it — a claim
  drawn from one or two matches must read as provisional.

Return the sentence alone, with no surrounding text.`;
}

export async function POST() {
  // 1. Auth guard
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Derive performance data server-side (auth-scoped — never trust the client)
  const [perf, { data: profile }] = await Promise.all([
    getOverallPerformance(),
    supabase.from("users").select("first_name").eq("id", user.id).single(),
  ]);

  const name = profile?.first_name?.trim() || "Player";

  // 3. Nothing recorded, no claim.
  //
  // 204 rather than prose: this used to answer with a line of marketing copy
  // ("Upload a match to unlock AI-powered insights"), which the card then
  // rendered in the claim slot at title weight, as though the engine had found
  // something. The card's own render gate (see `buildInsightEvidence`) decides
  // whether there are numbers worth showing; this only refuses to invent a
  // judgement about a player with no matches at all.
  if (perf.matchCount === 0) {
    return new Response(null, { status: 204 });
  }

  // 4. Build the system prompt and request a single insight
  const systemPrompt = buildHomeInsightSystemPrompt(perf, name);

  let iterable: AsyncIterable<string>;
  try {
    iterable = await getLLMStream(systemPrompt, [
      { role: "user", content: "Generate my performance insight." },
    ]);
  } catch (err) {
    console.error("LLM adapter error:", err);
    return new Response("LLM error", { status: 500 });
  }

  // 5. Pipe async iterable into a ReadableStream response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of iterable) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
