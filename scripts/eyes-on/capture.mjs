#!/usr/bin/env node
// Eyes-on capture harness for /pr-check Stage 3b.
//
// Signs in to a local dev server as the dedicated verifier account and
// screenshots each path it is given, writing PNGs plus a report.json that
// records the final URL, console errors and failed requests per page. The
// ui-verifier agent reads those files; this script makes no judgment.
//
//   node scripts/eyes-on/capture.mjs --out <dir> /dashboard /dashboard/matches …
//
// Environment (read from .env.local by this script — never pass the values
// on a command line, and never print them):
//   EYES_ON_EMAIL / EYES_ON_PASSWORD   the verifier account. Unset → exit 2.
//   EYES_ON_BASE_URL                   optional. Attach to a running loopback
//                                      dev server instead of starting one.
//
// Dev server: without EYES_ON_BASE_URL the script starts `next dev` on a free
// port and stops it on exit. Next 16 allows one dev server per checkout; if it
// reports an existing one, that server's URL is used instead. `.next/dev` is
// left alone either way — it may belong to the user's own server.
//
// Exit codes: 0 captured (findings live in report.json, not the exit code),
// 2 credentials unset, 3 sign-in failed, 1 anything else.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The checkout this script lives in — .env.local and `next dev` both
 * belong to it, whatever directory the caller happened to be in. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const VIEWPORT = { width: 1440, height: 900 };
/** A cold `next dev` compiles each route on first hit. */
const NAV_TIMEOUT = 90_000;
const SETTLE_TIMEOUT = 20_000;

function usage(msg) {
  if (msg) console.error(`capture: ${msg}`);
  console.error(
    "usage: node scripts/eyes-on/capture.mjs --out <dir> <path> [<path> …]",
  );
  process.exit(1);
}

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let out = "";
const paths = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") {
    out = argv[++i] ?? "";
  } else if (a.startsWith("--out=")) {
    out = a.slice("--out=".length);
  } else if (a.startsWith("/")) {
    paths.push(a);
  } else {
    usage(`unknown argument: ${a} (paths start with "/")`);
  }
}
if (!out) usage("--out <dir> is required");
if (paths.length === 0) usage("give at least one path to capture");
out = resolve(out);
mkdirSync(out, { recursive: true });

// ── env ────────────────────────────────────────────────────────────────────
/** Read the verifier credentials without printing either value. */
function loadEnv() {
  const fromProcess = (name) => process.env[name]?.trim() ?? "";
  let raw = "";
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) raw = readFileSync(envFile, "utf8");
  const fromFile = (name) =>
    raw
      .split("\n")
      .find((l) => l.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2") ?? "";
  const get = (name) => fromProcess(name) || fromFile(name);
  return {
    email: get("EYES_ON_EMAIL"),
    password: get("EYES_ON_PASSWORD"),
    baseUrl: get("EYES_ON_BASE_URL"),
  };
}

const env = loadEnv();
if (!env.email || !env.password) {
  console.error(
    "capture: EYES_ON credentials unset — set EYES_ON_EMAIL and EYES_ON_PASSWORD in .env.local (see .env.example)",
  );
  process.exit(2);
}

// ── dev server ─────────────────────────────────────────────────────────────
function assertLoopback(url) {
  const host = new URL(url).hostname;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) {
    console.error(`capture: EYES_ON_BASE_URL must be loopback, got ${host}`);
    process.exit(1);
  }
}

function freePort() {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.on("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}

/** Start `next dev`; resolve with the URL to use and a stop() function. */
function startDevServer(port) {
  return new Promise((done, fail) => {
    const child = spawn("npx", ["next", "dev", "-p", String(port)], {
      cwd: ROOT,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const log = [];
    let settled = false;
    const stop = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    const finish = (url) => {
      if (settled) return;
      settled = true;
      done({ url, stop });
    };
    const onLine = (line) => {
      log.push(line);
      if (log.length > 200) log.shift();
      // Next 16: "Another next dev server is already running … existing
      // server at http://localhost:3002". Use that one instead of failing.
      const existing = line.match(
        /existing server at (http:\/\/(?:localhost|127\.0\.0\.1):\d+)/,
      );
      if (existing) {
        stop();
        finish(existing[1]);
        return;
      }
      const local = line.match(
        /Local:\s+(http:\/\/(?:localhost|127\.0\.0\.1):\d+)/,
      );
      if (local) finish(local[1]);
    };
    const wire = (stream) => {
      let buf = "";
      stream.on("data", (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          onLine(buf.slice(0, idx));
          buf = buf.slice(idx + 1);
        }
      });
    };
    wire(child.stdout);
    wire(child.stderr);
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      fail(
        new Error(
          `next dev exited (${code}) before it was ready:\n${log.slice(-20).join("\n")}`,
        ),
      );
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      fail(
        new Error(
          `next dev did not report ready within 120s:\n${log.slice(-20).join("\n")}`,
        ),
      );
    }, 120_000).unref();
  });
}

// ── capture ────────────────────────────────────────────────────────────────
const slugOf = (p) =>
  p
    .replace(/^\//, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "root";

/** Wait until React's streamed Suspense boundaries have all resolved. */
async function settle(page) {
  await page
    .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT })
    .catch(() => {});
  await page
    .waitForFunction(
      () => document.querySelectorAll('template[id^="B:"]').length === 0,
      undefined,
      { timeout: SETTLE_TIMEOUT },
    )
    .catch(() => {});
  // Let any final paint (charts, images) land.
  await page.waitForTimeout(500);
}

async function main() {
  let baseUrl = env.baseUrl;
  let stopServer = () => {};
  if (baseUrl) {
    assertLoopback(baseUrl);
  } else {
    const port = await freePort();
    const started = await startDevServer(port);
    baseUrl = started.url;
    stopServer = started.stop;
  }
  baseUrl = baseUrl.replace(/\/$/, "");
  process.on("exit", stopServer);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      stopServer();
      process.exit(1);
    });
  }

  const browser = await chromium.launch();
  const statePath = join(out, "storage-state.json");
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(existsSync(statePath) ? { storageState: statePath } : {}),
  });
  // Without the pin the sidebar rail starts collapsed and every frame reads
  // narrower than the design.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("sidebar:pinned", "1");
    } catch {
      /* private mode */
    }
  });

  const report = {
    baseUrl,
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    signIn: existsSync(statePath) ? "reused storage state" : "fresh",
    pages: [],
  };

  // ── sign in ──
  const page = await context.newPage();
  const attachCollectors = (p, bucket) => {
    p.on("console", (m) => {
      if (m.type() === "error")
        bucket.consoleErrors.push(m.text().slice(0, 500));
    });
    p.on("pageerror", (e) =>
      bucket.consoleErrors.push(String(e).slice(0, 500)),
    );
    p.on("requestfailed", (r) =>
      bucket.failedRequests.push(
        `${r.method()} ${r.url()} — ${r.failure()?.errorText ?? "failed"}`,
      ),
    );
    p.on("response", (r) => {
      if (r.status() >= 400) {
        bucket.failedRequests.push(
          `${r.request().method()} ${r.url()} — ${r.status()}`,
        );
      }
    });
  };

  const reportPath = join(out, "report.json");
  const writeReport = () =>
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const signInBucket = { consoleErrors: [], failedRequests: [] };
  attachCollectors(page, signInBucket);
  await page.goto(`${baseUrl}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  if (/\/login(\?|$)/.test(page.url())) {
    await page.fill("#login-email", env.email);
    await page.fill("#login-password", env.password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    } catch {
      const shot = join(out, "sign-in-failed.png");
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      report.signIn = "failed";
      report.signInErrors = signInBucket;
      writeReport();
      console.error(
        `capture: sign-in did not reach /dashboard (landed on ${page.url()}); see ${shot}`,
      );
      await browser.close();
      process.exit(3);
    }
    await context.storageState({ path: statePath });
    report.signIn =
      report.signIn === "fresh"
        ? "signed in"
        : "reused state expired; signed in again";
  } else if (report.signIn === "fresh") {
    report.signIn = "already signed in (no login page shown)";
  }

  // ── pages ──
  for (const path of paths) {
    const entry = {
      path,
      finalUrl: "",
      status: null,
      screenshot: `${slugOf(path)}.png`,
      title: "",
      consoleErrors: [],
      failedRequests: [],
      links: [],
      note: "",
    };
    const shotPath = join(out, entry.screenshot);
    const p = await context.newPage();
    attachCollectors(p, entry);
    try {
      const resp = await p.goto(`${baseUrl}${path}`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      entry.status = resp?.status() ?? null;
      await settle(p);
      entry.finalUrl = p.url().replace(baseUrl, "");
      entry.title = await p.title();
      if (/^\/login/.test(entry.finalUrl)) entry.note = "bounced to /login";
      else if (/^\/onboarding/.test(entry.finalUrl))
        entry.note = "bounced to /onboarding (verifier account not onboarded)";
      // Same-origin links, so the agent can find a detail page's id without
      // guessing. Deduplicated, capped.
      entry.links = await p
        .$$eval("a[href^='/']", (as) =>
          Array.from(new Set(as.map((a) => a.getAttribute("href")))).slice(
            0,
            80,
          ),
        )
        .catch(() => []);
      await p.screenshot({ path: shotPath, fullPage: true });
    } catch (e) {
      entry.note = `error: ${String(e).slice(0, 300)}`;
      await p.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    } finally {
      await p.close();
    }
    report.pages.push(entry);
  }

  await browser.close();
  stopServer();
  writeReport();
  for (const e of report.pages) {
    const flag = e.note
      ? "!!"
      : e.consoleErrors.length || e.failedRequests.length
        ? "?"
        : "ok";
    console.log(
      `${flag.padEnd(2)} ${e.path} → ${e.finalUrl || "-"} (${e.status ?? "-"}) errors=${e.consoleErrors.length} failed=${e.failedRequests.length}${e.note ? ` ${e.note}` : ""}`,
    );
  }
  console.log(reportPath);
}

main().catch((e) => {
  console.error(`capture: ${e?.message ?? e}`);
  process.exit(1);
});
