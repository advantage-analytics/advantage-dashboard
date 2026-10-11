import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

test("two holds in one tab share the title without nesting their prefixes", () => {
  const page = fakeDocument("Matches · Advantage");
  const first = holdTabAwake("Uploading video", { document: page.doc });
  const second = holdTabAwake("Uploading video", { document: page.doc });

  first.setPercent(27);
  second.setPercent(5);
  expect(page.doc.title).toBe("5% · Uploading video · Matches · Advantage");
  // Many alternating writes later, still one prefix.
  for (let pct = 28; pct < 60; pct++) {
    first.setPercent(pct);
    second.setPercent(pct - 20);
  }
  expect(page.doc.title).toBe("39% · Uploading video · Matches · Advantage");

  // The first finishes while the second's title is showing: left alone.
  first.release();
  expect(page.doc.title).toBe("39% · Uploading video · Matches · Advantage");
  second.release();
  expect(page.doc.title).toBe("Matches · Advantage");
});

test("a hold started under another hold's title restores the page's own", () => {
  const page = fakeDocument("Matches · Advantage");
  const first = holdTabAwake("Uploading video", { document: page.doc });
  first.setPercent(80);
  // Captured while the first hold's prefix is on screen.
  const second = holdTabAwake("Uploading video", { document: page.doc });
  first.release();
  second.setPercent(3);
  expect(page.doc.title).toBe("3% · Uploading video · Matches · Advantage");
  second.release();
  expect(page.doc.title).toBe("Matches · Advantage");
});

test("the upload paths release the hold on every exit", () => {
  // Source-level: `uploadAndSubmitVideo` needs a live transfer to run. A cut
  // that fails never reaches the transfer's `finally`, so the outer `catch`
  // has to release too — beside each place the unload guard comes off.
  const read = (file: string) =>
    readFileSync(resolve(process.cwd(), file), "utf8");
  const submit = read("src/lib/services/splitstep/submit-match-video.ts");
  const guardOff =
    'window.removeEventListener("beforeunload", handleBeforeUnload);';
  const exits = submit.split(guardOff).slice(1);
  expect(exits).toHaveLength(2);
  for (const after of exits) {
    expect(after.trimStart().startsWith("awake.release();")).toBe(true);
  }
  expect(submit.indexOf("const awake = holdTabAwake();")).toBeGreaterThan(
    submit.indexOf('window.addEventListener("beforeunload"'),
  );

  const attach = read(
    "src/components/dashboard/matches/match-video-attachment/use-attachment-flow.ts",
  );
  const hold = attach.indexOf("const awake = holdTabAwake();");
  const release = attach.indexOf("} finally {\n          awake.release();");
  expect(hold).toBeGreaterThan(-1);
  expect(release).toBeGreaterThan(hold);
});
