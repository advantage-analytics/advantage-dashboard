import { expect, test } from "@playwright/test";

import { geminiRequestBody } from "@/lib/llm/adapter";

/**
 * The Gemini (OpenAI-compatible) request body. Production runs this path
 * (`LLM_PROVIDER=openai`), and Gemini answers sampling parameters with a 400
 * and counts thinking tokens against `max_tokens` — so however a caller
 * configures a call, neither may reach the body. Ask's plan step asks for
 * both (temperature 0, a 4096 cap); they apply on the Anthropic path only.
 */

const messages = [{ role: "user" as const, content: "How did I serve?" }];

test("a call that asks for temperature and a token cap sends neither to Gemini", () => {
  const body = geminiRequestBody("system", messages, {
    temperature: 0,
    maxTokens: 4096,
  });
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("max_tokens");
  expect(body).not.toHaveProperty("max_completion_tokens");
  expect(body).not.toHaveProperty("top_p");
});

test("the body streams, asks for usage, and puts the system prompt first", () => {
  const body = geminiRequestBody("system", messages, {});
  expect(body.stream).toBe(true);
  expect(body.stream_options).toEqual({ include_usage: true });
  expect(body.messages).toEqual([
    { role: "system", content: "system" },
    { role: "user", content: "How did I serve?" },
  ]);
  expect(body).not.toHaveProperty("response_format");
});

test("a JSON schema travels as response_format", () => {
  const schema = { type: "object" as const, properties: {} };
  const body = geminiRequestBody("system", messages, {
    jsonSchema: { name: "plan", schema },
  });
  expect(body.response_format).toEqual({
    type: "json_schema",
    json_schema: { name: "plan", schema },
  });
});
