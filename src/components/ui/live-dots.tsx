"use client";

import { useEffect, useRef } from "react";

/* The landing site's dot grid, alive — ported from advantage-landing's
   perspective/live-dots.tsx so the auth brand panel matches its hero mesh.
   Keep the two copies in step. The same 6px grid, drawn on a canvas so each dot can carry its own light: a few slow waves at random
   angles and speeds pass through the field, and where they overlap the dots
   dim and recover in drifting, irregular patches. The pointer brings up a
   soft pool of light that follows it with a lag, so the field answers the
   cursor without chasing it.

   Cost: one pixel per dot written straight into an ImageData (no per-dot draw
   calls), 30 fps, and nothing at all while the hero is off screen or the tab
   is hidden. Reduced motion gets one still frame: the grid, no waves, no
   cursor. The pattern is reseeded on every mount, so no two visits match.
   Callers place and mask it with their own class (the navy surfaces tie it
   to their glow). */

const PITCH = 6; // grid spacing, px (matches the dark bands' grid)
const OFFSET = 3; // first dot's inset, px
const CREST = 0.14; // dot alpha where the waves are brightest
const DIM = 0.35; // how far a trough dims the dots (fraction of CREST)
const CURSOR = 0.08; // extra alpha at the centre of the pointer's pool
const RADIUS = 80; // pool falloff (gaussian sigma), px
const LAG = 0.06; // share of the gap to the pointer closed per 60fps frame: lower is lazier
const FPS = 30;
const WAVES = 4;

type Wave = { dx: number; dy: number; k: number; speed: number; phase: number };

function seedWaves(): Wave[] {
  return Array.from({ length: WAVES }, () => {
    const a = Math.random() * Math.PI * 2;
    return {
      dx: Math.cos(a),
      dy: Math.sin(a),
      k: 0.004 + Math.random() * 0.007, // wavelength ~ 570–1570px
      speed: 0.18 + Math.random() * 0.32, // radians per second
      phase: Math.random() * Math.PI * 2,
    };
  });
}

export function LiveDots({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const waves = seedWaves();

    let w = 0;
    let h = 0;
    let img: ImageData | null = null;
    let xs = new Float32Array(0); // dot x, px
    let ys = new Float32Array(0); // dot y, px
    let at = new Uint32Array(0); // dot's alpha byte index in img.data
    let proj: Float32Array[] = []; // per wave: each dot's position along it

    function build() {
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      if (!w || !h) return;
      canvas!.width = w;
      canvas!.height = h;
      img = ctx!.createImageData(w, h);
      const cols = Math.ceil((w - OFFSET) / PITCH);
      const rows = Math.ceil((h - OFFSET) / PITCH);
      const n = cols * rows;
      xs = new Float32Array(n);
      ys = new Float32Array(n);
      at = new Uint32Array(n);
      proj = waves.map(() => new Float32Array(n));
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++, i++) {
          const x = OFFSET + c * PITCH;
          const y = OFFSET + r * PITCH;
          xs[i] = x;
          ys[i] = y;
          const p = (y * w + x) * 4;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
          at[i] = p + 3;
          for (let k = 0; k < WAVES; k++)
            proj[k][i] = (x * waves[k].dx + y * waves[k].dy) * waves[k].k;
        }
      }
    }

    // Pointer: the target, the lagging position that follows it, and how
    // present the pool is (eases in on enter, out on leave).
    let tx = 0;
    let ty = 0;
    let px = 0;
    let py = 0;
    let inside = false;
    let pool = 0;

    function draw(t: number) {
      if (!img) return;
      const d = img.data;
      const s = t / 1000;
      const phases = waves.map((v) => s * v.speed + v.phase);
      const r2 = 2 * RADIUS * RADIUS;
      const reach2 = 9 * RADIUS * RADIUS;
      for (let i = 0; i < at.length; i++) {
        let v = 0;
        for (let k = 0; k < WAVES; k++) v += Math.sin(proj[k][i] + phases[k]);
        // v in [-WAVES, WAVES] -> 0..1, eased so the troughs read as patches
        const n = (v / WAVES + 1) / 2;
        let a = CREST * (1 - DIM * (1 - n * n * (3 - 2 * n)));
        if (pool > 0.001) {
          const ddx = xs[i] - px;
          const ddy = ys[i] - py;
          const dd = ddx * ddx + ddy * ddy;
          if (dd < reach2) a += CURSOR * pool * Math.exp(-dd / r2);
        }
        d[at[i]] = a >= 1 ? 255 : (a * 255) | 0;
      }
      ctx!.putImageData(img, 0, 0);
    }

    build();
    if (reduce) {
      waves.forEach((v) => (v.speed = 0));
      draw(0);
      const ro = new ResizeObserver(() => {
        build();
        draw(0);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = 0;
    let onScreen = true;

    function frame(t: number) {
      raf = 0;
      if (!onScreen || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (t - last < 1000 / FPS - 1) return;
      // Ease by elapsed time, so the follow feels the same at any frame rate.
      const steps = Math.min((t - last) / (1000 / 60), 4);
      last = t;
      const follow = 1 - Math.pow(1 - LAG, steps);
      px += (tx - px) * follow;
      py += (ty - py) * follow;
      pool += ((inside ? 1 : 0) - pool) * (1 - Math.pow(0.96, steps));
      draw(t);
    }
    const start = () => {
      if (!raf && onScreen && !document.hidden)
        raf = requestAnimationFrame(frame);
    };

    function onMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const r = canvas!.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const now = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      if (now && !inside && pool < 0.01) {
        // Enter from rest: start the pool where the pointer is, not at 0,0.
        px = x;
        py = y;
      }
      inside = now;
      tx = x;
      ty = y;
    }
    const onLeave = () => (inside = false);

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      start();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => build());
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
