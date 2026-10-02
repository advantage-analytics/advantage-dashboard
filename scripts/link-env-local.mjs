// predev: in a git worktree with no .env.local, symlink the main checkout's.
//
// A worktree is a fresh checkout and .env.local is gitignored, so without it
// `next dev` dies in src/proxy.ts with "Your project's URL and Key are
// required to create a Supabase client!". `.worktreeinclude` and the
// SessionStart hook `.claude/hooks/bootstrap-worktree.sh` cover this too, but
// neither fires for every way a worktree gets made; this runs where the
// failure does. Same logic as the hook.
//
// Symlink, not copy: one copy of the service-role key on disk. Never blocks
// the dev server — every path exits 0.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

try {
  const top = resolve(git("rev-parse", "--show-toplevel"));
  let common = git("rev-parse", "--git-common-dir");
  if (!isAbsolute(common)) common = join(top, common);
  const main = dirname(resolve(common));

  // In the main checkout the common dir is `<top>/.git`, so main === top.
  if (main !== top) {
    const target = join(top, ".env.local");
    const source = join(main, ".env.local");
    // lstat so a dangling symlink still counts as "already there".
    const present =
      existsSync(target) ||
      (() => {
        try {
          return lstatSync(target).isSymbolicLink();
        } catch {
          return false;
        }
      })();
    if (!present) {
      if (existsSync(source)) {
        symlinkSync(source, target);
        console.log("[predev] .env.local symlinked from the main checkout.");
      } else {
        console.warn(
          "[predev] No .env.local here or in the main checkout; the dev server will fail without one.",
        );
      }
    }
  }
} catch (err) {
  console.warn(
    `[predev] link-env-local skipped: ${err instanceof Error ? err.message : err}`,
  );
}
