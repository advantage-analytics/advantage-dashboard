import { randomUUID } from "node:crypto";
import {
  linkSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { FullConfig } from "@playwright/test";

import { HAVE_ENV } from "./live-db";
import { LIVE_DB_PROJECT } from "./live-db-specs";

/**
 * One live-DB run per machine at a time.
 *
 * The `live-db` project's `workers: 1` spaces out one run's auth calls, but
 * Supabase rate-limits sign-ins per IP, and every worktree and session on a
 * machine shares that IP. On 2026-09-23 gate runs from several worktrees
 * stacked their bursts and drained the bucket together. So a run that may
 * write takes a lock at a path every worktree agrees on, and a second run
 * waits for it instead of competing.
 *
 * This file is also `playwright.config.ts`'s `globalSetup`: it runs in the
 * runner process, which lives exactly as long as the run, so the runner's
 * pid is the holder. A crash leaves the file behind with a dead pid, and the
 * next run takes it over rather than waiting on nobody.
 */

/** The same file for every checkout on the machine — `os.tmpdir()` is per user, not per worktree. */
export const LIVE_DB_LOCK_PATH = path.join(
  os.tmpdir(),
  "advantage-dashboard-live-db.lock",
);

/** Long enough for another worktree's whole serial live run, sign-in retries included. */
export const LOCK_WAIT_MS = 20 * 60_000;
const LOCK_POLL_MS = 5_000;

interface LockRecord {
  pid: number;
  token: string;
  cwd: string;
  since: string;
}

export interface LockOptions {
  lockPath?: string;
  waitMs?: number;
  pollMs?: number;
  /** The pid recorded as holder. Defaults to this process. */
  pid?: number;
  /** Whether a holder is still running. Omit outside unit tests. */
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

/** Signal 0 checks for existence without touching the process. EPERM means it exists as another user. */
function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function readRecord(file: string): LockRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as LockRecord).pid === "number" &&
      typeof (parsed as LockRecord).token === "string"
    ) {
      return parsed as LockRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

/**
 * Create the lock file whole, or report that it exists. Written aside and
 * hard-linked into place, because `link` fails on an existing path atomically
 * and a reader never sees a half-written record.
 */
function tryCreate(lockPath: string, record: LockRecord): boolean {
  const staging = `${lockPath}.${record.token}.tmp`;
  writeFileSync(staging, JSON.stringify(record));
  try {
    linkSync(staging, lockPath);
    return true;
  } catch (error) {
    if (errnoCode(error) === "EEXIST") return false;
    throw error;
  } finally {
    unlinkSync(staging);
  }
}

/**
 * Move a dead holder's file out of the way. The rename is atomic, so of two
 * runs taking over the same file only one moves it. If what was moved turns
 * out not to be the dead holder's — another run took over and re-created it
 * in between — it is linked back.
 */
function takeOver(lockPath: string, dead: LockRecord | null): void {
  const aside = `${lockPath}.${randomUUID()}.stale`;
  try {
    renameSync(lockPath, aside);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
  const moved = readRecord(aside);
  if (moved && moved.token !== dead?.token) {
    try {
      linkSync(aside, lockPath);
    } catch {
      // Something newer holds the path already; it wins.
    }
  }
  unlinkSync(aside);
}

/**
 * Take the lock, waiting up to `waitMs` for a live holder to let go. Resolves
 * to the release function; rejects with the lock path and holder's pid when
 * the wait runs out.
 */
export async function acquireLiveDbLock(
  options: LockOptions = {},
): Promise<() => void> {
  const lockPath = options.lockPath ?? LIVE_DB_LOCK_PATH;
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const isAlive = options.isAlive ?? pidIsAlive;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message: string) => console.log(message));

  const record: LockRecord = {
    pid: options.pid ?? process.pid,
    token: randomUUID(),
    cwd: process.cwd(),
    since: new Date(now()).toISOString(),
  };
  const started = now();
  let announced = false;

  for (;;) {
    if (tryCreate(lockPath, record)) {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        // Only ever remove our own record — never a successor's.
        if (readRecord(lockPath)?.token !== record.token) return;
        try {
          unlinkSync(lockPath);
        } catch {
          // Already gone.
        }
      };
    }

    const holder = readRecord(lockPath);
    if (!holder || !isAlive(holder.pid)) {
      log(
        `live-db lock: taking over ${lockPath} from ${holder ? `dead pid ${holder.pid}` : "an unreadable record"}`,
      );
      takeOver(lockPath, holder);
      continue;
    }

    if (now() - started + pollMs > waitMs) {
      throw new Error(
        `live-db lock: ${lockPath} is still held by pid ${holder.pid} (${holder.cwd}) after ${Math.round(waitMs / 1000)}s. ` +
          `Another live-DB run is in progress; wait for it, or delete the file if that pid is not a Playwright run.`,
      );
    }
    if (!announced) {
      announced = true;
      log(
        `live-db lock: waiting for pid ${holder.pid} (${holder.cwd}) to finish its live-DB run — ${lockPath}`,
      );
    }
    await sleep(pollMs);
  }
}

/**
 * `globalSetup`: take the lock when this run may write to a live project, and
 * hand Playwright the release as its teardown. A keyless run, or one that T1's
 * guard refused against production, writes nothing and never waits.
 */
export default async function liveDbLockSetup(
  config: FullConfig,
): Promise<(() => void) | undefined> {
  if (!HAVE_ENV) return undefined;
  if (!config.projects.some((project) => project.name === LIVE_DB_PROJECT)) {
    return undefined;
  }
  const release = await acquireLiveDbLock();
  // Teardown is skipped when the runner is killed mid-run; `exit` still fires
  // on an ordinary failure or Ctrl-C, and a SIGKILL is what takeover is for.
  process.once("exit", release);
  return release;
}
