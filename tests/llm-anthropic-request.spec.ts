import { expect, test } from "@playwright/test";

import {
  anthropicRequestBody,
  anthropicToolRequestBody,
  closedJsonSchema,
} from "@/lib/llm/adapter";
import { ASK_PLAN_REPLY_SCHEMA } from "@/lib/services/ask/prompts";

/**
 * The Anthropic request bodies. Current Claude models (Opus 5.5, Sonnet 5.5)
 * answer a 400 to sampling parameters, to a disabled `thinking`, and to a
 * forced `tool_choice` (`any` / `tool`) — so however a caller configures a
 * call, none of those may reach the body.
 */

const messages = [{ role: "user" as const, content: "How did I serve?" }];

test("no sampling parameters, no thinking switch, a ceiling that leaves room for thinking", () => {
  const body = anthropicRequestBody("system", messages, {
    temperature: 0,
    maxTokens: 1024,
  });
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("top_p");
  expect(body).not.toHaveProperty("thinking");
  expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
  expect(body.stream).toBe(true);
  expect(body.model).toBe("claude-opus-5-5");
  expect(body.output_config.effort).toBe("low");
  expect(body.fallbacks).toBe("default");
});

test("a JSON schema travels as structured outputs, not a forced tool", () => {
  const body = anthropicRequestBody("system", messages, {
    jsonSchema: ASK_PLAN_REPLY_SCHEMA,
    effort: "medium",
  });
  expect(body).not.toHaveProperty("tools");
  expect(body).not.toHaveProperty("tool_choice");
  expect(body.output_config.effort).toBe("medium");
  const format = body.output_config.format as {
    type: string;
    schema: {
      additionalProperties: boolean;
      properties: { state: { additionalProperties: boolean } };
    };
  };
  expect(format.type).toBe("json_schema");
  // Every object is closed, the nested one too.
  expect(format.schema.additionalProperties).toBe(false);
  expect(format.schema.properties.state.additionalProperties).toBe(false);
});

test("closedJsonSchema leaves the caller's schema untouched and an explicit flag alone", () => {
  const schema = {
    type: "object",
    additionalProperties: true,
    properties: { inner: { type: "object", properties: {} } },
  };
  const closed = closedJsonSchema(schema) as typeof schema & {
    properties: { inner: { additionalProperties?: boolean } };
  };
  expect(closed.additionalProperties).toBe(true);
  expect(closed.properties.inner.additionalProperties).toBe(false);
  expect(schema.properties.inner).not.toHaveProperty("additionalProperties");
});

test("a forced tool turn is auto plus a note after the tool results", () => {
  const tool = {
    name: "finish",
    description: "Finish.",
    inputSchema: { type: "object" as const, properties: {} },
  };
  const body = anthropicToolRequestBody(
    "system",
    [
      { role: "user", content: "How did I serve?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "t1", name: "run_query", input: {} }],
      },
      {
        role: "tool",
        results: [{ id: "t1", name: "run_query", content: "[]" }],
      },
    ],
    [tool],
    { toolChoice: { name: "finish" }, temperature: 0 },
  );
  expect(body.tool_choice).toEqual({ type: "auto" });
  expect(body).not.toHaveProperty("temperature");
  expect(body.output_config.effort).toBe("medium");
  const last = body.messages.at(-1) as {
    content: { type: string; text?: string }[];
  };
  expect(last.content[0].type).toBe("tool_result");
  expect(last.content.at(-1)).toEqual({
    type: "text",
    text: "Respond now by calling the finish tool.",
  });
  // Only the last turn carries the note.
  expect(body.messages[0]).toEqual({
    role: "user",
    content: "How did I serve?",
  });
});

test("an auto tool turn carries no note", () => {
  const body = anthropicToolRequestBody("system", messages, [], {
    toolChoice: "auto",
  });
  expect(body.messages).toEqual([
    { role: "user", content: "How did I serve?" },
  ]);
});
