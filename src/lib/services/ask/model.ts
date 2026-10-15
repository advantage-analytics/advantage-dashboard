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
  resolvedLLMModel,
} from "@/lib/llm/adapter";
import type { AskModel } from "@/lib/services/ask/ask";

/** The model ids the environment asks for per stage; undefined (an empty value too) for the provider's default. */
export function requestedStageModels(): {
  plan: string | undefined;
  answer: string | undefined;
} {
  return {
    plan: process.env.ASK_PLAN_MODEL || undefined,
    answer: process.env.ASK_ANSWER_MODEL || undefined,
  };
}

/**
 * The model each stage runs on, for ask_runs and the `ask_run` event: the
 * adapter's own resolution, so a substituted provider default is recorded as
 * what ran. Null in mock mode. A provider failover is not reflected.
 */
export function askStageModels(): {
  plan: string | null;
  answer: string | null;
} {
  const requested = requestedStageModels();
  return {
    plan: resolvedLLMModel(requested.plan),
    answer: resolvedLLMModel(requested.answer),
  };
}

export function askAdapterModel(input: {
  /** Whose question: the trace's distinct id. */
  userId: string;
  signal?: AbortSignal;
}): AskModel {
  const observability = createLLMObservabilityContext(input.userId);
  const stage = requestedStageModels();
  return {
    configured: isLLMConfigured(),
    stream: (systemPrompt, messages, call) =>
      getLLMStream(systemPrompt, messages, observability, {
        span: call ? `ask.${call.stage}` : "ask",
        model: call?.stage === "answer" ? stage.answer : stage.plan,
        temperature: call?.temperature,
        maxTokens: call?.maxTokens,
        jsonSchema: call?.jsonSchema,
        staticPrefixLength: call?.staticPrefixLength,
        signal: input.signal,
      }),
  };
}
