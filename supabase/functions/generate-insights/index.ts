// supabase/functions/generate-insights/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get("GEMINI_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

serve(async (req) => {
  try {
    // 1. We only need the matchId now
    const { matchId } = await req.json()

    if (!matchId) {
      return new Response(JSON.stringify({ error: "matchId is required" }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Query your View to get stats for the entire match
    const { data: matchStats, error: viewError } = await supabase
      .from('match_stats_with_percentages')
      .select('*')
      .eq('match_id', matchId)

    if (viewError || !matchStats || matchStats.length === 0) {
      throw new Error(`Failed to fetch stats from view: ${viewError?.message}`)
    }

    // 3. Separate the players based on the boolean
    const player1Stats = matchStats.find(stat => stat.is_player1 === true)
    const player2Stats = matchStats.find(stat => stat.is_player1 === false)

    // 3b. Comparison context (uploading user = player1, matching getPlayerAverageStats):
    // the player's career averages over PRIOR matches + their immediately previous match,
    // so the LLM can frame this match against them. Best-effort — any failure just omits it.
    let comparisonContext = ""
    try {
      const { data: matchRow } = await supabase
        .from('matches')
        .select('player1_id, date')
        .eq('id', matchId)
        .single()

      const userId = matchRow?.player1_id
      const matchDate = matchRow?.date

      if (userId && matchDate) {
        const { data: priorMatches } = await supabase
          .from('matches')
          .select('id, date')
          .eq('player1_id', userId)
          .lt('date', matchDate)
          .order('date', { ascending: false })

        if (priorMatches && priorMatches.length > 0) {
          const priorIds = priorMatches.map((m) => m.id)
          const prevMatchId = priorMatches[0].id

          const AVG_FIELDS = [
            'first_serve_pct', 'first_serve_won_pct', 'second_serve_won_pct',
            'service_games_won_pct', 'break_points_converted_pct', 'first_return_won_pct',
            'return_games_won_pct', 'winners', 'unforced_errors', 'aces', 'double_faults',
          ]

          const { data: priorRows } = await supabase
            .from('match_stats_with_percentages')
            .select(['match_id', ...AVG_FIELDS].join(', '))
            .in('match_id', priorIds)
            .eq('is_player1', true)

          if (priorRows && priorRows.length > 0) {
            const averages: Record<string, number | null> = {}
            for (const field of AVG_FIELDS) {
              const vals = priorRows
                .map((r) => Number(r[field] ?? 0))
                .filter((v) => !isNaN(v))
              averages[field] = vals.length
                ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
                : null
            }
            const prevRow = priorRows.find((r) => r.match_id === prevMatchId) ?? null

            if (priorRows.length === 1) {
              // Only one prior match: the "average" IS that match, so present a single
              // reference to avoid the model double-stating it or implying a long history.
              comparisonContext = `

      Player 1 comparison context (use ONLY for Player 1's summary):
      - This is only the player's 2nd recorded match. Their single prior match (their baseline AND previous match): ${JSON.stringify(prevRow ?? averages)}
      In Player 1's summary, briefly note whether they improved or regressed since that previous match — qualitatively, WITHOUT printing raw numbers. Do NOT imply an established trend or long history from a single prior match.`
            } else {
              comparisonContext = `

      Player 1 comparison context (use ONLY for Player 1's summary):
      - Typical averages across ${priorRows.length} prior matches: ${JSON.stringify(averages)}
      - Immediately previous match: ${prevRow ? JSON.stringify(prevRow) : "unavailable"}
      In Player 1's summary, frame THIS match against their typical averages AND their previous match (above/below their usual level; improved or regressed since last time) — qualitatively, WITHOUT printing raw numbers.`
            }
          }
        }
      }
    } catch (_err) {
      // Comparison is best-effort; on any failure fall back to match-only context.
      comparisonContext = ""
    }

    // 4. Define the strict JSON schema for BOTH players
    const insightItemSchema = {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" },
        value: { type: "INTEGER" }
      },
      required: ["name", "description", "value"]
    };

    const playerInsightsSchema = {
      type: "OBJECT",
      properties: {
        // One synthesized, dashboard-ready prose insight for this player. Mirrors
        // the home-dashboard AI insight voice (see src/app/api/home-insight/route.ts).
        summary: { type: "STRING" },
        strengths: { type: "ARRAY", items: insightItemSchema },
        weaknesses: { type: "ARRAY", items: insightItemSchema }
      },
      required: ["summary", "strengths", "weaknesses"]
    };

    const responseSchema = {
      type: "OBJECT",
      properties: {
        player1: playerInsightsSchema,
        player2: playerInsightsSchema
      },
      required: ["player1", "player2"]
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

    // 5. Build the prompt asking for insights on both players
    const prompt = `
      You are an expert college tennis coach. Analyze the following match statistics and provide, for BOTH Player 1 and Player 2:
      - 3 key strengths and 3 areas to improve (weaknesses). The 'value' should be the relevant percentage (0-100) associated with that specific stat.
      - a 'summary': a concise but insightful paragraph (4-5 sentences) speaking directly to the player about their performance and what to focus on next. Do not greet them, do not use markdown headers or bullet points, and do not restate the raw numbers as a list — synthesize them into a flowing observation with a clear recommendation.

      Crucially, contextualize their performances against each other. If Player 1 dominated at the net, factor that into Player 2's weaknesses.
      Keep everything encouraging and actionable for college athletes.

      Player 1 Stats: ${JSON.stringify(player1Stats || { note: "Stats unavailable" })}
      Player 2 Stats: ${JSON.stringify(player2Stats || { note: "Stats unavailable" })}${comparisonContext}
    `;

    // 6. Call the Gemini API via REST
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.4
        }
      })
    })

    const geminiData = await geminiResponse.json()

    // 👇 ADDED: Check if Google returned an API error
    if (!geminiResponse.ok) {
      console.error("GEMINI API ERROR Payload:", JSON.stringify(geminiData, null, 2))
      throw new Error(`Gemini API failed: ${geminiData.error?.message || "Unknown error"}`)
    }

    // 👇 ADDED: Safety check just in case the response is weirdly formatted
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      console.error("UNEXPECTED GEMINI RESPONSE:", JSON.stringify(geminiData, null, 2))
      throw new Error("Gemini API returned an empty or malformed response.")
    }

    const generatedInsights = geminiData.candidates[0].content.parts[0].text
    const insightsJSON = JSON.parse(generatedInsights)

    // 7. Update the 'matches' table directly
    // Assuming the primary key in your 'matches' table is 'id'
    const { error: dbError } = await supabase
      .from('matches')
      .update({ insights: insightsJSON })
      .eq('id', matchId)

    if (dbError) throw dbError

    return new Response(JSON.stringify({ success: true, insights: insightsJSON }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    console.error("CRITICAL ERROR IN GENERATE-INSIGHTS:", error.message, error.stack);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
