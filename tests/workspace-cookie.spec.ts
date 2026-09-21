import { expect, test } from "@playwright/test";

import {
  WORKSPACE_COOKIE,
  readWorkspaceCookie,
  staleChromeTarget,
} from "@/lib/workspace/workspace-cookie";

/**
 * `WorkspaceSync` refreshes the dashboard chrome on the strength of these two
 * functions alone, so a wrong answer here is either a chrome that never
 * catches up (Team Home beside a personal sidebar) or a refresh on every
 * navigation. Both are silent on screen until someone switches in two tabs.
 */
test.describe("readWorkspaceCookie", () => {
  test("finds the cookie among others, in any position", () => {
    expect(readWorkspaceCookie(`a=1; ${WORKSPACE_COOKIE}=team-1; b=2`)).toBe(
      "team-1",
    );
    expect(readWorkspaceCookie(`${WORKSPACE_COOKIE}=team-1`)).toBe("team-1");
  });

  test("does not match a cookie whose name only contains the key", () => {
    expect(readWorkspaceCookie(`x${WORKSPACE_COOKIE}=team-1`)).toBeNull();
  });

  test("an absent or empty cookie is null", () => {
    expect(readWorkspaceCookie("")).toBeNull();
    expect(readWorkspaceCookie("a=1; b=2")).toBeNull();
    expect(readWorkspaceCookie(`${WORKSPACE_COOKIE}=`)).toBeNull();
  });

  test("decodes an encoded value and survives a malformed one", () => {
    expect(readWorkspaceCookie(`${WORKSPACE_COOKIE}=a%2Db`)).toBe("a-b");
    expect(readWorkspaceCookie(`${WORKSPACE_COOKIE}=%E0%A4%A`)).toBe(
      "%E0%A4%A",
    );
  });
});

test.describe("staleChromeTarget", () => {
  test("agreeing chrome needs nothing", () => {
    expect(staleChromeTarget("team-1", "team-1")).toBeNull();
  });

  test("no cookie means the server's default drew the chrome", () => {
    expect(staleChromeTarget(null, "user-1")).toBeNull();
  });

  test("a cookie the chrome does not match is the refresh target", () => {
    expect(staleChromeTarget("team-2", "team-1")).toBe("team-2");
    expect(staleChromeTarget("team-1", "user-1")).toBe("team-1");
  });
});
