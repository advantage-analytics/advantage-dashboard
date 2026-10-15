/**
 * Whether a question asked for a chart — "chart my first serve", "graph it",
 * "plot my return points over time", "can you visualize that", "draw me a
 * picture of my serve". When it did, the answer's visual block leads: the
 * route marks the `visual` event (`lead`, `events.ts`) and the client draws
 * the block above the prose, with the sentences behind a disclosure
 * (roadmap 3.10).
 *
 * Deliberately narrow: a tennis "draw" is a tournament bracket, and "the
 * draw at nationals" asks for no picture. Pure: no imports.
 */

const CHART_WORD =
  /\b(?:charts?|graphs?|plots?|plotted|plotting|visuali[sz](?:e|es|ed|ing|ation)|diagrams?|sketch(?:es|ed)?|infographics?)\b/i;

/** "a picture of", "as a picture" — a picture asked for, not a word in passing. */
const PICTURE = /\b(?:as|in) a picture\b|\bpicture of\b/i;

/**
 * "draw" as the verb with something to draw after it — "draw me", "draw a
 * chart", "draw it up" — never "the draw" or "main draw", which is the
 * bracket.
 */
const DRAW_VERB =
  /\bdraw\s+(?:me|it|that|this|a|an|the|my|his|her|their|our|its|up|out)\b/i;
const TOURNAMENT_DRAW =
  /\b(?:the|a|main|qualifying|qualies|tournament|consolation|back|singles|doubles)\s+draw\b/i;

/** Whether the question asks for the answer as a chart. */
export function asksForChart(question: string): boolean {
  if (CHART_WORD.test(question) || PICTURE.test(question)) return true;
  return DRAW_VERB.test(question) && !TOURNAMENT_DRAW.test(question);
}
