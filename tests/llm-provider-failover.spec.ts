import { expect, test } from "@playwright/test";

import {
  createLLMObservabilityContext,
  llmFailureFields,
  runWithProviderFailover,
  type LLMServed,
} from "@/lib/llm/adapter";

/**
 * A failed primary provider call is retried on the other provider. That
 * retry must be visible: one `llm_provider_failover` event in PostHog per
 * failed primary call, carrying who failed and how — never the prompt, the
 * reply or the error's message — and the caller told which model answered.
 * Offline: both providers and PostHog are stubs.
 */

const PROMPT = "How did Maya serve in the second set?";
const REPLY = "Maya won 71% of first-serve points.";
const LEAKY_MESSAGE = `400 {"type":"error","error":{"type":"invalid_request_error","message":"bad request near: ${PROMPT}"}}`;

/** An Anthropic SDK `APIError`'s shape: status, body type, class name, and a message that quotes the request. */
class BadRequestError extends Error {
  status = 400;
  type = "invalid_request_error";
  constructor() {
    super(LEAKY_MESSAGE);
    this.name = "BadRequestError";
  }
}

function stubPostHog() {
  const captured: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }[] = [];
  return {
    captured,
    client: {
      capture: (message: (typeof captured)[number]) => {
        captured.push(message);
      },
      flush: async () => {},
    },
  };
}

test("a failed primary call is one failover event, and the secondary answers", async () => {
  const posthog = stubPostHog();
  const context = createLLMObservabilityContext("user-1");
  const served: LLMServed[] = [];
  const calls: string[] = [];

  const result = await runWithProviderFailover(
    {
      primary: {
        provider: "anthropic",
        model: "claude-opus-5-5",
        run: async () => {
          calls.push("anthropic");
          throw new BadRequestError();
        },
      },
      secondary: {
        provider: "openai",
        model: "gemini-3.5-flash-lite",
        run: async () => {
          calls.push("openai");
          return REPLY;
        },
      },
    },
    context,
    {
      span: "ask.plan",
      model: "claude-sonnet-5-5",
      onServed: (s) => served.push(s),
    },
    "stream",
    posthog.client as never,
  );

  expect(result).toBe(REPLY);
  expect(calls).toEqual(["anthropic", "openai"]);
  expect(served).toEqual([
    { provider: "openai", model: "gemini-3.5-flash-lite", failover: true },
  ]);

  expect(posthog.captured).toHaveLength(1);
  const [event] = posthog.captured;
  expect(event.event).toBe("llm_provider_failover");
  expect(event.distinctId).toBe("user-1");
  expect(event.properties).toEqual({
    primary_provider: "anthropic",
    secondary_provider: "google",
    primary_model: "claude-opus-5-5",
    secondary_model: "gemini-3.5-flash-lite",
    requested_model: "claude-sonnet-5-5",
    call: "stream",
    $ai_span_name: "ask.plan",
    $ai_trace_id: context.traceId,
    $ai_session_id: context.sessionId,
    error_status: 400,
    error_type: "invalid_request_error",
    error_code: null,
    error_name: "BadRequestError",
  });

  // No prompt, reply or error message text anywhere in the event.
  const sent = JSON.stringify(event);
  expect(sent).not.toContain("Maya");
  expect(sent).not.toContain("bad request near");
  expect(sent).not.toContain(REPLY);
});

test("a primary that answers sends no event and reports itself", async () => {
  const posthog = stubPostHog();
  const served: LLMServed[] = [];
  const turn = await runWithProviderFailover(
    {
      primary: {
        provider: "openai",
        model: "gemini-3.5-flash-lite",
        run: async () => "ok",
      },
      secondary: {
        provider: "anthropic",
        model: "claude-opus-5-5",
        run: async () => {
          throw new Error("must not run");
        },
      },
    },
    createLLMObservabilityContext("user-2"),
    { span: "ask.agent", onServed: (s) => served.push(s) },
    "tool_turn",
    posthog.client as never,
  );
  expect(turn).toBe("ok");
  expect(posthog.captured).toHaveLength(0);
  expect(served).toEqual([
    { provider: "openai", model: "gemini-3.5-flash-lite", failover: false },
  ]);
});

test("no secondary, or an aborted call: the error is thrown and no event is sent", async () => {
  const posthog = stubPostHog();
  const failing = {
    provider: "anthropic" as const,
    model: "claude-opus-5-5",
    run: async (): Promise<string> => {
      throw new BadRequestError();
    },
  };
  await expect(
    runWithProviderFailover(
      { primary: failing, secondary: null },
      createLLMObservabilityContext("user-3"),
      {},
      "stream",
      posthog.client as never,
    ),
  ).rejects.toThrow(BadRequestError);

  const aborted = new AbortController();
  aborted.abort();
  await expect(
    runWithProviderFailover(
      {
        primary: failing,
        secondary: {
          provider: "openai",
          model: "gemini-3.5-flash-lite",
          run: async () => "x",
        },
      },
      createLLMObservabilityContext("user-3"),
      { signal: aborted.signal },
      "stream",
      posthog.client as never,
    ),
  ).rejects.toThrow(BadRequestError);
  expect(posthog.captured).toHaveLength(0);
});

test("a secondary that fails too still leaves exactly one event", async () => {
  const posthog = stubPostHog();
  await expect(
    runWithProviderFailover(
      {
        primary: {
          provider: "openai",
          model: "gemini-3.5-flash-lite",
          run: async () => {
            throw Object.assign(new Error("Incorrect API key provided: sk-…"), {
              status: 401,
              code: "invalid_api_key",
            });
          },
        },
        secondary: {
          provider: "anthropic",
          model: "claude-opus-5-5",
          run: async () => {
            throw new Error("down too");
          },
        },
      },
      createLLMObservabilityContext("user-4"),
      { span: "home.insight" },
      "stream",
      posthog.client as never,
    ),
  ).rejects.toThrow("down too");
  expect(posthog.captured).toHaveLength(1);
  expect(posthog.captured[0].properties).toMatchObject({
    primary_provider: "google",
    secondary_provider: "anthropic",
    requested_model: null,
    error_status: 401,
    error_code: "invalid_api_key",
  });
  expect(JSON.stringify(posthog.captured[0])).not.toContain(
    "Incorrect API key",
  );
});

test("failure fields drop anything that is not a short identifier", () => {
  expect(llmFailureFields("boom")).toEqual({
    error_status: null,
    error_type: null,
    error_code: null,
    error_name: null,
  });
  expect(
    llmFailureFields({
      status: 400,
      type: "a sentence with spaces",
      code: PROMPT,
    }),
  ).toEqual({
    error_status: 400,
    error_type: null,
    error_code: null,
    error_name: null,
  });
});
