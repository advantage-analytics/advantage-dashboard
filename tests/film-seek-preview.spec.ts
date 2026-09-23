import { expect, test } from "@playwright/test";

import {
  createSeekCoalescer,
  laneFraction,
  PREVIEW_FADE_MS,
  PREVIEW_FRAME,
  PREVIEW_HANG_PX,
  PREVIEW_OVERHANG_PX,
  PREVIEW_PAD_PX,
  PREVIEW_REST_MS,
  PREVIEW_SEEK_INTERVAL_MS,
  previewBoxWidth,
  previewLeft,
  trackRunGradient,
} from "@/components/dashboard/matches/match-detail/film/film-seek-preview";

/**
 * A deterministic fake clock + scheduler for `createSeekCoalescer`. `now()`
 * reads a manually-advanced counter; `schedule()` queues a callback against
 * that counter instead of a real timer. `advanceTo(t)` moves the clock to
 * `t` and runs every timer due at or before it, in `fireAt` order — including
 * timers a just-run callback itself schedules, so a chain of `flush()` calls
 * settles fully before `advanceTo` returns.
 */
function createClock() {
  let t = 0;
  let nextId = 0;
  const timers: { id: number; fireAt: number; fn: () => void }[] = [];

  const now = () => t;

  const schedule = (fn: () => void, ms: number) => {
    const id = nextId++;
    timers.push({ id, fireAt: t + ms, fn });
    return () => {
      const i = timers.findIndex((timer) => timer.id === id);
      if (i !== -1) timers.splice(i, 1);
    };
  };

  function drainDue() {
    for (;;) {
      let dueIndex = -1;
      let dueAt = Infinity;
      for (let i = 0; i < timers.length; i++) {
        if (timers[i].fireAt <= t && timers[i].fireAt < dueAt) {
          dueAt = timers[i].fireAt;
          dueIndex = i;
        }
      }
      if (dueIndex === -1) return;
      const [timer] = timers.splice(dueIndex, 1);
      timer.fn();
    }
  }

  function advanceTo(target: number) {
    t = target;
    drainDue();
  }

  return { now, schedule, advanceTo };
}

test.describe("PREVIEW_* constants", () => {
  test("carry the design's numbers", () => {
    expect(PREVIEW_FRAME).toEqual({
      report: { width: 160, height: 90 },
      room: { width: 256, height: 144 },
    });
    expect(PREVIEW_OVERHANG_PX).toEqual({ report: 8, room: 0 });
    expect(PREVIEW_PAD_PX).toBe(4);
    expect(PREVIEW_HANG_PX).toBe(6);
    expect(PREVIEW_REST_MS).toBe(150);
    expect(PREVIEW_FADE_MS).toBe(200);
    expect(PREVIEW_SEEK_INTERVAL_MS).toBe(120);
  });

  test("previewBoxWidth is the frame plus padding on both sides", () => {
    expect(previewBoxWidth("report")).toBe(160 + 2 * 4);
    expect(previewBoxWidth("room")).toBe(256 + 2 * 4);
  });
});

test.describe("previewLeft", () => {
  test("centres the box on the pointer", () => {
    const left = previewLeft({
      pointerX: 100,
      laneWidth: 800,
      boxWidth: 168,
      overhang: 8,
    });
    expect(left).toBe(100 - 168 / 2);
  });

  test("clamps to -overhang at the lane's start, overhang 8", () => {
    const left = previewLeft({
      pointerX: 0,
      laneWidth: 800,
      boxWidth: 168,
      overhang: 8,
    });
    expect(left).toBe(-8);
  });

  test("clamps to laneWidth - boxWidth + overhang at the lane's end, overhang 8", () => {
    const left = previewLeft({
      pointerX: 800,
      laneWidth: 800,
      boxWidth: 168,
      overhang: 8,
    });
    expect(left).toBe(800 - 168 + 8);
  });

  test("clamps to 0 at the lane's start when overhang is 0 (room lane)", () => {
    const left = previewLeft({
      pointerX: 0,
      laneWidth: 800,
      boxWidth: 264,
      overhang: 0,
    });
    expect(left).toBe(0);
  });

  test("clamps to laneWidth - boxWidth at the lane's end when overhang is 0", () => {
    const left = previewLeft({
      pointerX: 800,
      laneWidth: 800,
      boxWidth: 264,
      overhang: 0,
    });
    expect(left).toBe(800 - 264);
  });

  test("a lane narrower than the box pins to the lower bound", () => {
    // laneWidth - boxWidth + overhang (-60) falls below -overhang (-8): the
    // clamp's own bounds are inverted, and the lower bound wins rather than
    // whichever a plain min/max clamp order would produce.
    const left = previewLeft({
      pointerX: 50,
      laneWidth: 100,
      boxWidth: 168,
      overhang: 8,
    });
    expect(left).toBe(-8);
  });

  test("a zero-width lane also pins to the lower bound", () => {
    const left = previewLeft({
      pointerX: 0,
      laneWidth: 0,
      boxWidth: 168,
      overhang: 8,
    });
    expect(left).toBe(-8);
  });
});

test.describe("laneFraction", () => {
  test("centred pointer gives 0.5", () => {
    expect(laneFraction(500, 100, 800)).toBeCloseTo(0.5, 10);
  });

  test("clamps to 0 before the lane's start", () => {
    expect(laneFraction(50, 100, 800)).toBe(0);
  });

  test("clamps to 1 past the lane's end", () => {
    expect(laneFraction(1000, 100, 800)).toBe(1);
  });

  test("a zero-width lane returns 0 instead of dividing by zero", () => {
    expect(laneFraction(500, 100, 0)).toBe(0);
  });
});

test.describe("trackRunGradient", () => {
  test("extends the existing --film-t split with a --film-hover lift, exact string", () => {
    const gradient = trackRunGradient({ start: 10, end: 20 });
    const watchedSplit =
      "clamp(0%, calc((var(--film-t, 0) - 10) / 10 * 100%), 100%)";
    const hoverSplit =
      "clamp(0%, calc((var(--film-hover, -1) - 10) / 10 * 100%), 100%)";
    expect(gradient).toBe(
      `linear-gradient(to right, var(--blue) 0 ${watchedSplit}, rgba(255,255,255,0.34) ${watchedSplit} ${hoverSplit}, rgba(255,255,255,0.22) ${hoverSplit} 100%)`,
    );
  });
});

test.describe("createSeekCoalescer", () => {
  test("issues immediately when nothing is in flight and the interval has elapsed", () => {
    const clock = createClock();
    const seeks: number[] = [];
    const coalescer = createSeekCoalescer({
      seek: (v) => seeks.push(v),
      minIntervalMs: 120,
      now: clock.now,
      schedule: clock.schedule,
    });

    coalescer.request(5);

    expect(seeks).toEqual([5]);
  });

  test("a burst of requests under the interval floor coalesces to a handful of seeks", () => {
    const clock = createClock();
    const seeks: number[] = [];
    const coalescer = createSeekCoalescer({
      seek: (v) => {
        seeks.push(v);
        // The preview element's own seek completes quickly; the coalescer
        // only learns about it once `landed()` fires.
        clock.schedule(() => coalescer.landed(), 5);
      },
      minIntervalMs: 120,
      now: clock.now,
      schedule: clock.schedule,
    });

    // 20 requests, 10ms apart, spanning 190ms.
    for (let i = 0; i < 20; i++) {
      clock.advanceTo(i * 10);
      coalescer.request(i);
    }
    // Let every outstanding interval wait and landed() timer resolve.
    clock.advanceTo(1000);

    expect(seeks.length).toBeLessThanOrEqual(Math.ceil(200 / 120) + 1);
    expect(seeks[seeks.length - 1]).toBe(19);
  });

  test("a request held during flight is issued exactly once on landed()", () => {
    const clock = createClock();
    const seeks: number[] = [];
    const coalescer = createSeekCoalescer({
      seek: (v) => seeks.push(v),
      minIntervalMs: 50,
      now: clock.now,
      schedule: clock.schedule,
    });

    coalescer.request(1); // issues immediately, now in flight
    expect(seeks).toEqual([1]);

    clock.advanceTo(10);
    coalescer.request(2); // held: a seek is in flight
    clock.advanceTo(20);
    coalescer.request(3); // still held, replaces 2 — never a queue
    expect(seeks).toEqual([1]);

    clock.advanceTo(60); // the interval has now elapsed too
    coalescer.landed();

    expect(seeks).toEqual([1, 3]);
  });

  test("cancel() drops the wanted time; a later landed() issues nothing", () => {
    const clock = createClock();
    const seeks: number[] = [];
    const coalescer = createSeekCoalescer({
      seek: (v) => seeks.push(v),
      minIntervalMs: 50,
      now: clock.now,
      schedule: clock.schedule,
    });

    coalescer.request(1); // issues immediately, now in flight
    clock.advanceTo(10);
    coalescer.request(2); // held
    coalescer.cancel();

    clock.advanceTo(100);
    coalescer.landed();

    expect(seeks).toEqual([1]);
  });
});
