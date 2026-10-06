import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  FULLSCREEN_EVENTS,
  enterFullscreen,
  exitFullscreen,
  fullscreenActive,
  fullscreenSupported,
  fullscreenLeft,
  requestFullscreen,
  type FullscreenDocument,
} from "@/components/admin/labels/use-browser-fullscreen";

/**
 * The browser's full screen, which IS the console's full-screen layout — its
 * pure half (`use-browser-fullscreen.ts`): the feature detection, the two
 * requests and how a request comes out,
 * driven with plain objects standing in for the document — the standard API,
 * Safari's `webkit` spellings alone, a browser with neither, and a browser
 * that refuses.
 */

/** A document with the standard API, recording what was asked of it. */
function standard(refuse = false) {
  const calls: unknown[] = [];
  const doc: FullscreenDocument = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    exitFullscreen: async () => {
      calls.push("exit");
      doc.fullscreenElement = null;
    },
    documentElement: {
      requestFullscreen: async (options) => {
        calls.push(["request", options]);
        if (refuse) throw new TypeError("Permissions check failed");
        doc.fullscreenElement = doc.documentElement;
      },
    },
  };
  return { doc, calls };
}

/** An older Safari: only the prefixed names, and requests that return nothing. */
function webkitOnly() {
  const calls: string[] = [];
  const doc: FullscreenDocument = {
    webkitFullscreenEnabled: true,
    webkitFullscreenElement: null,
    webkitExitFullscreen: () => {
      calls.push("webkitExit");
      doc.webkitFullscreenElement = null;
    },
    documentElement: {
      webkitRequestFullscreen: () => {
        calls.push("webkitRequest");
        doc.webkitFullscreenElement = doc.documentElement;
      },
    },
  };
  return { doc, calls };
}

test("the standard API: supported, asked of the root with the navigation hidden", async () => {
  const { doc, calls } = standard();
  expect(fullscreenSupported(doc)).toBe(true);
  expect(fullscreenActive(doc)).toBe(false);

  expect(await requestFullscreen(doc)).toBe("entered");
  expect(calls).toEqual([["request", { navigationUI: "hide" }]]);
  expect(fullscreenActive(doc)).toBe(true);
  // Already on: entered, with nothing asked of the browser again.
  expect(await requestFullscreen(doc)).toBe("entered");
  expect(calls).toHaveLength(1);

  expect(await exitFullscreen(doc)).toBe(true);
  expect(calls[1]).toBe("exit");
  expect(fullscreenActive(doc)).toBe(false);
});

test("webkit only: the prefixed names carry it, with no promise to wait on", async () => {
  const { doc, calls } = webkitOnly();
  expect(fullscreenSupported(doc)).toBe(true);
  expect(fullscreenActive(doc)).toBe(false);

  expect(await enterFullscreen(doc)).toBe(true);
  expect(fullscreenActive(doc)).toBe(true);
  expect(await exitFullscreen(doc)).toBe(true);
  expect(calls).toEqual(["webkitRequest", "webkitExit"]);
  expect(fullscreenActive(doc)).toBe(false);
});

test("the standard names win where a browser has both", async () => {
  const { doc, calls } = standard();
  const prefixed = webkitOnly();
  Object.assign(doc, {
    webkitFullscreenEnabled: true,
    webkitExitFullscreen: prefixed.doc.webkitExitFullscreen,
  });
  Object.assign(doc.documentElement ?? {}, prefixed.doc.documentElement);
  await enterFullscreen(doc);
  await exitFullscreen(doc);
  expect(calls).toHaveLength(2);
  expect(prefixed.calls).toEqual([]);
});

test("unsupported: the request says so, and both verbs answer false", async () => {
  const none: FullscreenDocument = { documentElement: {} };
  const disabled: FullscreenDocument = {
    // An embedding frame without the allowance: the method is there, the
    // permission is not.
    fullscreenEnabled: false,
    documentElement: { requestFullscreen: async () => {} },
  };
  const rootless: FullscreenDocument = {
    fullscreenEnabled: true,
    documentElement: null,
  };
  for (const doc of [none, disabled, rootless]) {
    expect(fullscreenSupported(doc)).toBe(false);
    expect(fullscreenActive(doc)).toBe(false);
    expect(await enterFullscreen(doc)).toBe(false);
    expect(await requestFullscreen(doc)).toBe("unsupported");
  }
  expect(await exitFullscreen(none)).toBe(false);
});

test("a refusal is swallowed: rejected or thrown, it answers false and stays off", async () => {
  const { doc } = standard(true);
  await expect(enterFullscreen(doc)).resolves.toBe(false);
  // The console reads this one: refused, not unsupported.
  expect(await requestFullscreen(doc)).toBe("refused");
  expect(fullscreenActive(doc)).toBe(false);

  // A synchronous throw, as an old prefixed implementation can.
  const thrower: FullscreenDocument = {
    webkitFullscreenEnabled: true,
    webkitFullscreenElement: {},
    webkitExitFullscreen: () => {
      throw new Error("not allowed");
    },
    documentElement: {
      webkitRequestFullscreen: () => {
        throw new Error("not allowed");
      },
    },
  };
  await expect(enterFullscreen(thrower)).resolves.toBe(false);
  await expect(exitFullscreen(thrower)).resolves.toBe(false);
});

test("both change events are listened for", () => {
  expect([...FULLSCREEN_EVENTS]).toEqual([
    "fullscreenchange",
    "webkitfullscreenchange",
  ]);
});

test("a change event means LEFT only when nothing is fullscreened any more", async () => {
  const { doc } = standard();
  await requestFullscreen(doc);
  // The change that follows entering: not a leave.
  expect(fullscreenLeft(doc)).toBe(false);
  await exitFullscreen(doc);
  expect(fullscreenLeft(doc)).toBe(true);
});

test.describe("the hook", () => {
  const source = readFileSync(
    "src/components/admin/labels/use-browser-fullscreen.ts",
    "utf8",
  );
  const hook = source.slice(
    source.indexOf("export function useBrowserFullscreen"),
  );

  test("no separate whole-screen control is left: two verbs and one callback", () => {
    for (const gone of [
      "WHOLE_SCREEN_COPY",
      "BrowserFullscreenControl",
      "toggleFullscreen",
      "useSyncExternalStore",
    ]) {
      expect(source, gone).not.toContain(gone);
    }
    expect(hook).toContain("return { enter, leave };");
  });

  test("`onLeft` runs from a real change event alone, never for the state a page starts in", () => {
    // The one call, inside the listener, after the not-active check.
    expect(hook.match(/left\.current\?\.\(\)/g)).toHaveLength(1);
    expect(hook).toMatch(
      /const changed = \(\) => \{\s+if \(!fullscreenLeft\(document\)\) return;[\s\S]*?entered\.current = false;\s+left\.current\?\.\(\);\s+\};/,
    );
    expect(hook).toMatch(
      /for \(const name of FULLSCREEN_EVENTS\) \{\s+document\.addEventListener\(name, changed\);/,
    );
    // Nothing reads the document's state on mount.
    const mount = hook.slice(
      hook.indexOf("useEffect(() => {\n    const changed"),
      hook.indexOf("const enter = useCallback"),
    );
    expect(mount.match(/fullscreenLeft\(document\)/g)).toHaveLength(1);
    expect(mount).not.toContain("fullscreenActive(document)");
  });

  test("it leaves only a full screen it entered itself, and unmounting leaves it", () => {
    expect(hook).toMatch(
      /const leave = useCallback\(\(\) => \{\s+if \(!entered\.current\) return;\s+entered\.current = false;\s+if \(fullscreenActive\(document\)\) void exitFullscreen\(document\);/,
    );
    expect(hook).toContain("useEffect(() => leave, [leave]);");
    // Entering what was already on by another road is not ours to leave.
    expect(hook).toContain("const ours = !fullscreenActive(document);");
    expect(hook).toContain("if (ours) entered.current = true;");
    expect(hook).toContain(
      'if (ours && outcome !== "entered") entered.current = false;',
    );
  });
});
