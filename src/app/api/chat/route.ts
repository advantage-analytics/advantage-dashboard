import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLLMStream, type ChatMessage } from "@/lib/llm/adapter";

interface MatchContext {
  player1Name: string;
  player2Name: string;
  finalScore: string;
  tournamentName: string;
  courtType: string | null;
  statsP1: string;
  statsP2: string;
  keyMoments: Array<{ moment: string; description: string }>;
  insights: {
    player1?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
    player2?: {
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
  } | null;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  matchContext: MatchContext;
}

function buildSystemPrompt(ctx: MatchContext): string {
  const courtLine = ctx.courtType ? ` · ${ctx.courtType}` : "";

  const keyMomentsText =
    ctx.keyMoments.length > 0
      ? ctx.keyMoments
          .map((m, i) => `${i + 1}. ${m.moment}: ${m.description}`)
          .join("\n")
      : "No key moments recorded.";

  const formatInsights = (
    player: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> } | undefined
  ) => {
    if (!player) return "  No insights available.";
    const lines: string[] = [];
    if (player.strengths?.length) {
      lines.push("  Strengths:");
      player.strengths.forEach((s) => lines.push(`    - ${s.name} (${s.value}%): ${s.description}`));
    }
    if (player.weaknesses?.length) {
      lines.push("  Areas to improve:");
      player.weaknesses.forEach((w) => lines.push(`    - ${w.name} (${w.value}%): ${w.description}`));
    }
    return lines.length > 0 ? lines.join("\n") : "  No insights available.";
  };

  return `You are an AI tennis analytics assistant for the Advantage platform.

Match: ${ctx.player1Name} vs ${ctx.player2Name} — ${ctx.finalScore}
Tournament: ${ctx.tournamentName}${courtLine}

${ctx.player1Name} Statistics:
${ctx.statsP1}

${ctx.player2Name} Statistics:
${ctx.statsP2}

Key Moments:
${keyMomentsText}

AI Insights:
${ctx.player1Name}:
${formatInsights(ctx.insights?.player1)}

${ctx.player2Name}:
${formatInsights(ctx.insights?.player2)}

Be concise, analytical, and actionable. Tie every recommendation to the match data above. Speak directly to the player.`;
}

export async function POST(request: NextRequest) {
  // 1. Auth guard
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Parse body
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, matchContext } = body;
  if (!messages || !matchContext) {
    return new Response("Missing messages or matchContext", { status: 400 });
  }

  // 3. Build system prompt
  const systemPrompt = buildSystemPrompt(matchContext);

  // 4. Get LLM stream
  let iterable: AsyncIterable<string>;
  try {
    iterable = await getLLMStream(systemPrompt, messages);
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
