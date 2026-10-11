import { expect, test } from "@playwright/test";

import {
  holdTabAwake,
  type TabAwakeDocument,
  type TabAwakeEnv,
} from "@/lib/services/upload/tab-keep-awake";

/**
 * The upload's two courtesies — a screen wake lock and the percentage in the
 * tab title — against a stubbed `document` and `navigator`. What matters is
 * that neither can disturb an upload: no support, a refusal and a late grant
 * all have to be quiet.
 */

function fakeDocument(title = "Matches · Advantage") {
  const listeners = new Set<() => void>();
  const doc = {
    title,
    visibilityState: "visible",
    addEventListener: (_: "visibilitychange", fn: () => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_: "visibilitychange", fn: () => void) => {
      listeners.delete(fn);
    },
  };
  return {
    doc: doc as TabAwakeDocument,
    listeners,
    show: () => {
      doc.visibilityState = "visible";
      for (const fn of [...listeners]) fn();
    },
    hide: () => {
      doc.visibilityState = "hidden";
      for (const fn of [...listeners]) fn();
    },
  };
}

function fakeWakeLock() {
  const sentinels: { released: boolean; release: () => Promise<void> }[] = [];
  let requests = 0;
  return {
    sentinels,
    get requests() {
      return requests;
    },
    navigator: {
      wakeLock: {
        request: async (type: "screen") => {
          expect(type).toBe("screen");
          requests += 1;
          const sentinel = {
            released: false,
            release: async () => {
              sentinel.released = true;
            },
          };
          sentinels.push(sentinel);
          return sentinel;
        },
      },
    },
  };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

test("requests a screen wake lock at start and releases it at the end", async () => {
  const page = fakeDocument();
  const lock = fakeWakeLock();
  const hold = holdTabAwake("Uploading video", {
    document: page.doc,
    navigator: lock.navigator,
  });
  await settle();
  expect(lock.requests).toBe(1);
  expect(lock.sentinels[0].released).toBe(false);
  expect(page.listeners.size).toBe(1);

  hold.release();
  await settle();
  expect(lock.sentinels[0].released).toBe(true);
  expect(page.listeners.size).toBe(0);

  // Twice is safe.
  hold.release();
});

test("re-acquires when the tab becomes visible again, because hiding it drops the lock", async () => {
  const page = fakeDocument();
  const lock = fakeWakeLock();
  const hold = holdTabAwake("Uploading video", {
    document: page.doc,
    navigator: lock.navigator,
  });
  await settle();

  // The browser releases the sentinel itself when the tab is hidden.
  page.hide();
  lock.sentinels[0].released = true;
  expect(lock.requests).toBe(1);

  page.show();
  await settle();
  expect(lock.requests).toBe(2);

  // Visible again with a live lock: nothing to do.
  page.show();
  await settle();
  expect(lock.requests).toBe(2);

  hold.release();
  await settle();
  expect(lock.sentinels[1].released).toBe(true);
});

test("a lock granted after release is handed straight back", async () => {
  const page = fakeDocument();
  const lock = fakeWakeLock();
  const hold = holdTabAwake("Uploading video", {
    document: page.doc,
    navigator: lock.navigator,
  });
  hold.release();
  await settle();
  expect(lock.sentinels[0].released).toBe(true);
});

test("no wake lock support, a refusal and a throwing request are all silent", async () => {
  const unsupported: TabAwakeEnv = { document: fakeDocument().doc };
  expect(() =>
    holdTabAwake("Uploading video", unsupported).release(),
  ).not.toThrow();

  const refusing: TabAwakeEnv = {
    document: fakeDocument().doc,
    navigator: {
      wakeLock: { request: () => Promise.reject(new Error("NotAllowedError")) },
    },
  };
  const hold = holdTabAwake("Uploading video", refusing);
  await settle();
  hold.setPercent(10);
  hold.release();

  const throwing: TabAwakeEnv = {
    document: fakeDocument().doc,
    navigator: {
      wakeLock: {
        request: () => {
          throw new Error("SecurityError");
        },
      },
    },
  };
  expect(() =>
    holdTabAwake("Uploading video", throwing).release(),
  ).not.toThrow();

  // No DOM at all — the wizard's hook specs run this way.
  const bare = holdTabAwake("Uploading video", {});
  bare.setPercent(50);
  bare.release();
});

test("the tab title carries the floored percent and is restored afterwards", () => {
  const page = fakeDocument("Matches · Advantage");
  const hold = holdTabAwake("Uploading video", { document: page.doc });

  hold.setPercent(27.9);
  expect(page.doc.title).toBe("27% · Uploading video · Matches · Advantage");
  hold.setPercent(28.01);
  expect(page.doc.title).toBe("28% · Uploading video · Matches · Advantage");

  hold.release();
  expect(page.doc.title).toBe("Matches · Advantage");

  // After release nothing writes.
  hold.setPercent(90);
  expect(page.doc.title).toBe("Matches · Advantage");
});

test("in-app navigation mid-upload: the new page's title is kept, prefixed, then restored", () => {
  const page = fakeDocument("New match · Advantage");
  const hold = holdTabAwake("Uploading video", { document: page.doc });

  hold.setPercent(40);
  // The router sets the next route's title under the running upload.
  page.doc.title = "Home · Advantage";
  hold.setPercent(40.4);
  expect(page.doc.title).toBe("40% · Uploading video · Home · Advantage");

  hold.release();
  expect(page.doc.title).toBe("Home · Advantage");
});

test("a title the page set after our last write is left alone on release", () => {
  const page = fakeDocument("New match · Advantage");
  const hold = holdTabAwake("Uploading video", { document: page.doc });
  hold.setPercent(99);
  page.doc.title = "Mob vs Test · Advantage";
  hold.release();
  expect(page.doc.title).toBe("Mob vs Test · Advantage");
});

test("an untitled page gets the bare label, with no trailing separator", () => {
  const page = fakeDocument("");
  const hold = holdTabAwake("Uploading video", { document: page.doc });
  hold.setPercent(5);
  expect(page.doc.title).toBe("5% · Uploading video");
  hold.release();
  expect(page.doc.title).toBe("");
});
