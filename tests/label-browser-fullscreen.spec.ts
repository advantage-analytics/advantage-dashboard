import { expect, test } from "@playwright/test";

import {
  enterFullscreen,
  exitFullscreen,
  fullscreenActive,
  fullscreenSupported,
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

test("a change event means LEFT only when nothing is fullscreened any more", async () => {
  const { doc } = standard();
  await requestFullscreen(doc);
  // The change that follows entering: not a leave.
  expect(fullscreenActive(doc)).toBe(true);
  await exitFullscreen(doc);
  expect(fullscreenActive(doc)).toBe(false);
});
