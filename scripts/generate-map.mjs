#!/usr/bin/env node
// Rewrites MAP.md's route table from the filesystem. The route table is the
// part of the map that rots, and it is derivable — so it is generated, and
// everything outside the markers stays hand-written.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const APP = "src/app";
const MAP = "MAP.md";
const START = "<!-- ROUTES:START -->";
const END = "<!-- ROUTES:END -->";

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (entry.name === "page.tsx") out.push(path);
  }
  return out;
}

// App Router: route groups like (auth) and (home) shape the file tree but not
// the URL, so they are dropped. Dynamic segments like [matchId] are kept.
function toRoute(file) {
  const segments = relative(APP, file)
    .split("/")
    .slice(0, -1)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

const files = (await walk(APP)).sort();
const rows = files.map((f) => `| \`${toRoute(f)}\` | [\`${f}\`](${f}) |`);
const table = ["| Route | Page file |", "|---|---|", ...rows].join("\n");

const current = await readFile(MAP, "utf8");
const region = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!region.test(current)) {
  console.error(`${MAP}: missing ${START} / ${END} markers`);
  process.exit(1);
}

const next = current.replace(region, `${START}\n\n${table}\n\n${END}`);
if (next === current) {
  console.log(`${MAP}: ${rows.length} routes, already current`);
} else {
  await writeFile(MAP, next);
  console.log(`${MAP}: ${rows.length} routes written`);
}
