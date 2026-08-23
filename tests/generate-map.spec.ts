import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// The generator writes MAP.md in place. Both tests below run it, so they must
// not run concurrently with each other — `writeFile` is not atomic, and
// `fullyParallel: true` in playwright.config.ts would otherwise let a
// read-then-write from one test tear a read in the other, right in the run
// where the staleness signal matters most.
test.describe.configure({ mode: 'serial' });

test('MAP.md route table is current', () => {
  const before = readFileSync('MAP.md', 'utf8');
  try {
    execFileSync('node', ['scripts/generate-map.mjs'], { stdio: 'pipe' });
    const after = readFileSync('MAP.md', 'utf8');
    expect(after, 'MAP.md is stale — run `npm run map` and commit the result').toBe(before);
  } finally {
    // The generator mutates a tracked file as a side effect of checking it.
    // Restore the snapshot so this test never leaves MAP.md modified,
    // whether it passes or fails.
    writeFileSync('MAP.md', before);
  }
});

test('the generator is idempotent', () => {
  const before = readFileSync('MAP.md', 'utf8');
  try {
    execFileSync('node', ['scripts/generate-map.mjs'], { stdio: 'pipe' });
    const once = readFileSync('MAP.md', 'utf8');
    execFileSync('node', ['scripts/generate-map.mjs'], { stdio: 'pipe' });
    expect(readFileSync('MAP.md', 'utf8')).toBe(once);
  } finally {
    writeFileSync('MAP.md', before);
  }
});
