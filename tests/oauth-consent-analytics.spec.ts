import { expect, test } from "@playwright/test";
import { connectorApp } from "@/lib/auth/oauth-consent";

/**
 * `oauth_consent_viewed` / `oauth_consent_decided` name the asking app by
 * `connectorApp()`. Under dynamic client registration the client's name is
 * whatever the registrant typed, so the event reads the allowlisted callback
 * instead — these pin that only a fixed enum, or null, can leave the browser.
 */

test("each allowlisted callback names its app", () => {
  expect(connectorApp("https://claude.ai/api/mcp/auth_callback")).toBe(
    "claude",
  );
  expect(connectorApp("https://claude.com/api/mcp/auth_callback")).toBe(
    "claude",
  );
  expect(
    connectorApp("https://chatgpt.com/connector_platform_oauth_redirect"),
  ).toBe("chatgpt");
  expect(connectorApp("https://chatgpt.com/connector/oauth/abc_123")).toBe(
    "chatgpt",
  );
  expect(
    connectorApp("https://oauth-redirect.googleusercontent.com/r/some-app"),
  ).toBe("gemini");
  expect(connectorApp("https://www.cursor.com/agents/mcp/oauth/callback")).toBe(
    "cursor",
  );
  expect(connectorApp("http://localhost:8787/callback")).toBe("local");
  expect(connectorApp("http://127.0.0.1:33418/cb")).toBe("local");
});

test("a callback off the allowlist, or none, is null — never its host", () => {
  expect(connectorApp(null)).toBeNull();
  expect(connectorApp("")).toBeNull();
  expect(connectorApp("https://evil.example/api/mcp/auth_callback")).toBeNull();
  expect(connectorApp("https://claude.ai/somewhere-else")).toBeNull();
  expect(
    connectorApp("cursor://anysphere.cursor-mcp/oauth/callback"),
  ).toBeNull();
  expect(connectorApp("not a url")).toBeNull();
});
