/**
 * Seed the program directory from the claim dataset.
 *
 *   npx tsx scripts/seed-programs.ts [dataset-dir] [--apply]
 *
 * Dry-run by default: it parses, transforms and reports, and writes nothing
 * unless `--apply` is passed. The dataset is 1,940 programs, 2,027 domain rows
 * and 3,117 real people's email addresses; a seed that runs on a typo is not
 * something to discover afterwards.
 *
 * Idempotent. Programs upsert on `program_key` and domains on
 * `(program_id, domain)`. Contacts upsert on `(program_id, email)`, stamped
 * `source = 'scrape'`, and then a scrape-only prune deletes the scraped
 * contacts of a dataset program whose email the refreshed scrape no longer
 * lists (the diff is `staleScrapeContacts` in `lib/contact-prune.ts`). Admin
 * rows (`source = 'admin'`, typed in by the admin console) and every row of a
 * program absent from the dataset are never touched: a scraped row that would
 * land on an admin row is skipped rather than upserted over it
 * (`withoutAdminCollisions`). So re-running against a
 * refreshed scrape converges rather than duplicating. It never touches
 * `status`, `owner_user_id` or `claimed_at` on a program that already exists —
 * those are claim state, and a re-seed must not un-claim somebody's workspace.
 *
 * The dry run still connects: it reads the live program ids and contacts so it
 * can print how many contacts the prune WOULD delete. It writes nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, orNull, asBool, asInt } from "./lib/csv";
import {
  type ExistingContact,
  normalizeEmail,
  staleScrapeContacts,
  withoutAdminCollisions,
} from "./lib/contact-prune";

// argv[0] is the node binary and argv[1] this script — both are paths, so the
// scan has to start after them.
const args = process.argv.slice(2);
const dir =
  args.find((a) => !a.startsWith("--")) ??
  "/Users/cjgimena/Desktop/advantage-program-claim-dataset";
const APPLY = args.includes("--apply");
const CHUNK = 500;
// `.in("…", ids)` puts every id in the URL; 100 uuids stays well under the
// request-line limits PostgREST sits behind.
const ID_CHUNK = 100;

/** Read NEXT_PUBLIC_SUPABASE_URL and the service key without printing either. */
function loadEnv(): { url: string; key: string } {
  const raw = readFileSync(".env.local", "utf8");
  const get = (name: string) =>
    raw
      .split("\n")
      .find((l) => l.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim() ?? "";
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local",
    );
  }
  return { url, key };
}

const read = (f: string) => parseCsv(readFileSync(join(dir, f), "utf8"));

async function chunked<T>(rows: T[], fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
    process.stdout.write(
      `\r    ${Math.min(i + CHUNK, rows.length)}/${rows.length}`,
    );
  }
  process.stdout.write("\n");
}

async function main() {
  const programs = read("programs.csv");
  const domains = read("program_domains.csv");
  const contacts = read("program_contacts.csv");

  const programRows = programs.map((p) => ({
    program_key: p.program_id,
    school_group: p.school_group,
    school_name: p.school_name,
    school_abbrev: orNull(p.school_abbrev),
    team: p.team,
    division: orNull(p.division),
    conference: orNull(p.conference),
    city: orNull(p.city),
    state: orNull(p.state),
    athletics_url: orNull(p.athletics_url),
    staff_page_url: orNull(p.staff_page_url),
    primary_domain: orNull(p.primary_domain),
    primary_domain_inferred: asBool(p.primary_domain_inferred),
    // ';'-joined in the CSV, text[] in Postgres.
    athletics_domains: (p.athletics_domains ?? "")
      .split(";")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    domain_match_skips_review: asBool(p.domain_match_skips_review),
    review_reasons: orNull(p.review_reasons),
    contact_count: asInt(p.contact_count),
    domain_evidence_count: asInt(p.domain_evidence_count),
    domain_shared_with_schools: asInt(p.domain_shared_with_schools),
  }));

  const eligible = programRows.filter(
    (p) => p.domain_match_skips_review,
  ).length;
  const noEvidence = programRows.filter(
    (p) => !p.primary_domain && p.athletics_domains.length === 0,
  ).length;
  const byDivision = programRows.reduce<Record<string, number>>((acc, p) => {
    acc[p.division ?? "unknown"] = (acc[p.division ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nparsed from ${dir}`);
  console.log(`  programs             ${programRows.length}`);
  console.log(`  domains              ${domains.length}`);
  console.log(`  contacts             ${contacts.length}`);
  console.log(`  by division          ${JSON.stringify(byDivision)}`);
  console.log(`  eligible to skip     ${eligible}`);
  console.log(`  no domain evidence   ${noEvidence}`);

  // Cheap integrity gates. Each of these silently corrupts the claim check if
  // it slips through, and none is recoverable by looking at the result.
  const groups = new Set(programRows.map((p) => `${p.school_group}|${p.team}`));
  const keys = new Set(programRows.map((p) => p.program_key));
  const problems: string[] = [];
  if (groups.size !== programRows.length)
    problems.push("(school_group, team) is not unique");
  if (keys.size !== programRows.length)
    problems.push("program_key is not unique");
  if (programRows.some((p) => !p.school_group))
    problems.push("a program has no school_group");
  if (programRows.some((p) => !["mens", "womens"].includes(p.team)))
    problems.push("bad team value");
  if (problems.length) {
    console.error("\nREFUSING TO SEED:");
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  // Connect in both modes: the dry run reads (program ids, current contacts)
  // so it can report what the prune would delete. Every write below sits
  // behind `APPLY`.
  const { url, key } = loadEnv();
  const db = createClient(url, key, { auth: { persistSession: false } });

  if (APPLY) {
    console.log("\n  programs");
    await chunked(programRows, async (batch) => {
      // Upsert on the natural key. `status`, `owner_user_id` and `claimed_at`
      // are absent from the payload on purpose, so re-seeding never un-claims
      // a program somebody already owns.
      const { error } = await db
        .from("programs")
        .upsert(batch, { onConflict: "program_key" });
      if (error) throw new Error(`programs: ${error.message}`);
    });
  }

  // Paged. PostgREST caps a select at 1000 rows by default, and an unpaged
  // read silently returned ids for 1000 of 1940 programs — the other 940 would
  // have had every domain and contact dropped, with no error anywhere.
  const idFor = new Map<string, string>();
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await db
      .from("programs")
      .select("id, program_key")
      .order("program_key")
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(`id map: ${error.message}`);
    for (const r of data ?? [])
      idFor.set(r.program_key as string, r.id as string);
    if (!data || data.length < CHUNK) break;
  }
  console.log(`\n  id map               ${idFor.size}`);

  // The failure this guards against is silent: rows for unmapped programs are
  // filtered out below, so a short map looks like a smaller dataset. In a dry
  // run a new program simply is not in the database yet — reported, not fatal.
  const unmapped = programRows.filter((p) => !idFor.has(p.program_key)).length;
  if (unmapped > 0) {
    if (APPLY) {
      throw new Error(
        `${unmapped} programs have no id after upsert — refusing to seed children`,
      );
    }
    console.log(`  not yet in database  ${unmapped}`);
  }

  const domainRows = domains
    .filter((d) => idFor.has(d.program_id))
    .map((d) => ({
      program_id: idFor.get(d.program_id)!,
      domain: d.domain.trim().toLowerCase(),
      registrable_domain: orNull(d.registrable_domain)?.toLowerCase() ?? null,
      kind: orNull(d.kind),
      is_academic: asBool(d.is_academic),
      observed_addresses: asInt(d.observed_addresses),
      evidence: orNull(d.evidence),
    }));

  const contactRows = contacts
    .filter((c) => idFor.has(c.program_id) && c.email?.trim())
    .map((c) => ({
      program_id: idFor.get(c.program_id)!,
      email: normalizeEmail(c.email),
      email_domain: orNull(c.email_domain)?.toLowerCase() ?? null,
      registrable_domain: orNull(c.registrable_domain)?.toLowerCase() ?? null,
      is_freemail: asBool(c.is_freemail),
      name: orNull(c.name),
      role: orNull(c.role),
      source_url: orNull(c.source_url),
      was_emailed: asBool(c.was_emailed),
      // No column default: a row that does not say where it came from fails.
      // Only `scrape` rows are ever eligible for the prune below.
      source: "scrape" as const,
    }));

  // ── Existing contacts ────────────────────────────────────────────────────
  // Read before any write: the upsert must skip rows that would land on an
  // admin row, and the prune below diffs against the same read.
  //
  // Every mapped dataset program gets a key, including one with no contacts in
  // the CSV: its whole scraped staff departed. Programs outside the dataset
  // get no key, so `staleScrapeContacts` never looks at their rows.
  const dataset = new Map<string, string[]>();
  for (const p of programRows) {
    const id = idFor.get(p.program_key);
    if (id) dataset.set(id, []);
  }
  for (const c of contactRows) dataset.get(c.program_id)!.push(c.email);

  const programIds = [...dataset.keys()];
  const existing: ExistingContact[] = [];
  for (let i = 0; i < programIds.length; i += ID_CHUNK) {
    const ids = programIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await db
        .from("program_contacts")
        .select("id, program_id, email, source")
        .in("program_id", ids)
        .order("id")
        .range(from, from + CHUNK - 1);
      if (error) throw new Error(`program_contacts read: ${error.message}`);
      existing.push(...((data ?? []) as ExistingContact[]));
      if (!data || data.length < CHUNK) break;
    }
  }

  const toUpsert = withoutAdminCollisions(contactRows, existing);
  const kept = contactRows.length - toUpsert.length;
  if (kept > 0) {
    console.log(`  skip (admin row)     ${kept} scrape contacts`);
  }

  if (APPLY) {
    console.log("  domains");
    await chunked(domainRows, async (batch) => {
      const { error } = await db
        .from("program_domains")
        .upsert(batch, { onConflict: "program_id,domain" });
      if (error) throw new Error(`program_domains: ${error.message}`);
    });

    console.log("  contacts");
    await chunked(toUpsert, async (batch) => {
      const { error } = await db
        .from("program_contacts")
        .upsert(batch, { onConflict: "program_id,email" });
      if (error) throw new Error(`program_contacts: ${error.message}`);
    });
  }

  // ── Prune ────────────────────────────────────────────────────────────────
  const stale = staleScrapeContacts(existing, dataset);
  const bySource = existing.reduce<Record<string, number>>((acc, r) => {
    acc[r.source] = (acc[r.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `  existing contacts    ${existing.length} ${JSON.stringify(bySource)}`,
  );
  console.log(
    `  prune ${APPLY ? "deleting" : "would delete"}   ${stale.length} scrape contacts`,
  );
  if (stale.length > 0) {
    // Program ids only — the emails are real people's addresses.
    const staleSet = new Set(stale);
    const perProgram = existing
      .filter((r) => staleSet.has(r.id))
      .reduce<Record<string, number>>((acc, r) => {
        acc[r.program_id] = (acc[r.program_id] ?? 0) + 1;
        return acc;
      }, {});
    for (const [programId, n] of Object.entries(perProgram).slice(0, 5)) {
      console.log(`    ${programId}  ${n}`);
    }
  }

  if (!APPLY) {
    console.log("\ndry run — nothing written. Re-run with --apply.\n");
    return;
  }

  if (stale.length > 0) {
    console.log("  prune");
    for (let i = 0; i < stale.length; i += ID_CHUNK) {
      const { error } = await db
        .from("program_contacts")
        .delete()
        .in("id", stale.slice(i, i + ID_CHUNK))
        .eq("source", "scrape");
      if (error) throw new Error(`program_contacts prune: ${error.message}`);
    }
  }

  console.log("\nseeded.\n");
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
