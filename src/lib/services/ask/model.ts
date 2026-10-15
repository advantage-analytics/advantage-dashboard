/**
 * The `AskModel` the orchestrator is handed, built from the adapter.
 *
 * One observability context per question, so the plan, pattern and answer
 * calls (and any retry) land under one PostHog trace, each named by its
 * stage; a model per stage from the environment, since the planner needs
 * SQL accuracy and the writer only prose; and the caller's abort signal, so
 * a closed tab or a spent deadline stops the provider request too. The
 * route (`/api/ask`) and the arrival path (`arrival.ts`) both build theirs
 * here, so the two cannot drift.
 */

import {
  createLLMObservabilityContext,
  getLLMStream,
  isLLMConfigured,
} from "@/lib/llm/adapter";
import type { AskModel } from "@/lib/services/ask/ask";

/** The model ids the environment names per stage; null for the provider's default. */
export function askStageModels(): {
  plan: string | null;
  answer: string | null;
} {
  return {
    plan: process.env.ASK_PLAN_MODEL ?? null,
    answer: process.env.ASK_ANSWER_MODEL ?? null,
  };
}

export function askAdapterModel(input: {
  /** Whose question: the trace's distinct id. */
  userId: string;
  signal?: AbortSignal;
}): AskModel {
  const observability = createLLMObservabilityContext(input.userId);
  const stage = askStageModels();
  return {
    configured: isLLMConfigured(),
    stream: (systemPrompt, messages, call) =>
      getLLMStream(systemPrompt, messages, observability, {
        span: call ? `ask.${call.stage}` : "ask",
        model:
          (call?.stage === "answer" ? stage.answer : stage.plan) ?? undefined,
        temperature: call?.temperature,
        maxTokens: call?.maxTokens,
        jsonSchema: call?.jsonSchema,
        staticPrefixLength: call?.staticPrefixLength,
        signal: input.signal,
      }),
  };
}
