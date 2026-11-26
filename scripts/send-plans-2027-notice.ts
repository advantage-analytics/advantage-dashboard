/**
 * The December plans notice — "Free beta hours end December 31" — to every
 * account, and the pilot teams' own wording to their owners and coaches.
 * Stage 0 of `docs/plans/2027-pricing.md`.
 *
 * Run by Cj, by hand, once, on his go-ahead. Nothing else calls it: no cron,
 * no route, no test. A dry run is the default and sends nothing.
 *
 *   npx tsx scripts/send-plans-2027-notice.ts                 # dry run: counts per group
 *   npx tsx scripts/send-plans-2027-notice.ts --group general --send --confirm 86
 *   npx tsx scripts/send-plans-2027-notice.ts --group pilot   --send --confirm 5
 *
 * Guards, each one a refusal rather than a warning:
 *  - `--send` needs `--confirm <n>` equal to the number this run would mail,
 *    so the count Cj read in the dry run is the count that goes out.
 *  - Refuses under CI or a test runner, and without `RESEND_API_KEY` (which
 *    would otherwise print every mail instead of sending it).
 *  - The pilot group refuses until `PILOT_NOTICE_APPROVED` is true in the
 *    template. Until then, and for any pilot team with no `pilot_ends_on`,
 *    that team's owners and coaches are HELD: they get the general notice
 *    instead, so nobody goes unnotified, and the pilot mail later on top.
 *  - Every mail claims `notification_sends` first (`plans_2027_notice:<user>`,
 *    `plans_2027_pilot_notice:<program>:<user>`), so a re-run after a crash or
 *    a partial send mails only those who didn't get it. A failed send releases
 *    its key so the next run retries it.
 *
 * Env (the shell wins over `.env.local`): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (send only), NEXT_PUBLIC_SITE_URL.
 * Prints no address in full and no secret.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnvLocal } from "./lib/env";
import {
  PILOT_NOTICE_APPROVED,
  plans2027NoticeEmail,
  plans2027PilotNoticeEmail,
  sendEmail,
  type EmailMessage,
} from "../src/lib/services/email";
import { programDisplayName } from "../src/lib/data/programs-server";
import {
  noticeDedupeKey,
  PILOT_2027_PROGRAM_IDS,
  selectNoticeRecipients,
  type GeneralRecipient,
  type NoticeAccount,
  type PilotRecipient,
} from "../src/lib/services/plans-2027/notice-recipients";

loadEnvLocal();

type Group = "general" | "pilot" | "all";

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const group = (value("--group") ?? "all") as Group;
  if (!["general", "pilot", "all"].includes(group))
    fail(`--group must be general, pilot or all (got "${group}").`);
  const confirm = value("--confirm");
  return {
    send: argv.includes("--send"),
    group,
    confirm: confirm === undefined ? undefined : Number(confirm),
  };
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) fail(`Missing ${name}.`);
  return v;
}

function redact(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}…@${domain}`;
}

async function listAccounts(db: SupabaseClient): Promise<NoticeAccount[]> {
  const out: NoticeAccount[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) fail(`listUsers: ${error.message}`);
    for (const u of data.users) {
      const bannedUntil = (u as { banned_until?: string | null }).banned_until;
      out.push({
        id: u.id,
        email: u.email ?? null,
        confirmed: Boolean(u.email_confirmed_at),
        banned: Boolean(bannedUntil && new Date(bannedUntil) > new Date()),
      });
    }
    if (data.users.length < 1000) return out;
  }
}

async function readAll<T>(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) fail(`${label}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.send) {
    if (
      process.env.CI ||
      process.env.PLAYWRIGHT_TEST_BASE_URL ||
      process.env.TEST_WORKER_INDEX
    )
      fail("Refusing to send from CI or a test run.");
    required("RESEND_API_KEY");
  }

  const db = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  // `programs` holds the whole college directory, far past PostgREST's
  // 1,000-row page, so read only the teams that can have a recipient — and
  // page both reads anyway.
  const [accounts, members, programs] = await Promise.all([
    listAccounts(db),
    readAll<{ program_id: string; user_id: string; role: string }>(
      "program_members",
      (from, to) =>
        db
          .from("program_members")
          .select("program_id, user_id, role")
          .order("id")
          .range(from, to),
    ),
    readAll<{
      id: string;
      school_name: string;
      team: string | null;
      owner_user_id: string | null;
      pilot_ends_on: string | null;
    }>("programs", (from, to) =>
      db
        .from("programs")
        .select("id, school_name, team, owner_user_id, pilot_ends_on")
        .or(
          `owner_user_id.not.is.null,id.in.(${PILOT_2027_PROGRAM_IDS.join(",")})`,
        )
        .order("id")
        .range(from, to),
    ),
  ]);

  const r = selectNoticeRecipients({
    accounts,
    memberships: members.map((m) => ({
      programId: m.program_id,
      userId: m.user_id,
      role: m.role,
    })),
    programs: programs.map((p) => ({
      id: p.id,
      name: programDisplayName(p.school_name, p.team),
      ownerUserId: p.owner_user_id,
      pilotEndsOn: p.pilot_ends_on,
    })),
    pilotNoticeReady: PILOT_NOTICE_APPROVED,
    excludeEmails: [
      process.env.EYES_ON_EMAIL,
      process.env.EYES_ON_LABELLER_EMAIL,
    ].filter((e): e is string => Boolean(e)),
  });

  const skippedBy = (reason: string) =>
    r.skipped.filter((s) => s.reason === reason).length;
  console.log("Plans 2027 notice — recipients");
  console.log(`  general notice     ${r.general.length}`);
  console.log(`    of which team owners  ${r.teamOwners.length}`);
  console.log(`  pilot notice       ${r.pilot.length}`);
  for (const p of r.pilot)
    console.log(
      `    ${p.programName} · ${redact(p.email)} · ends ${p.pilotEndsOn}`,
    );
  console.log(
    `  pilot held         ${r.pilotHeld.length} (sent the general notice until their pilot mail can go)`,
  );
  for (const p of r.pilotHeld)
    console.log(
      `    ${p.programName} · ${redact(p.email)} · ${PILOT_NOTICE_APPROVED ? "no pilot_ends_on" : "wording not approved"}`,
    );
  if (r.missingPilotPrograms.length)
    console.log(
      `  pilot ids with no program: ${r.missingPilotPrograms.join(", ")}`,
    );
  console.log(
    `  skipped            unconfirmed ${skippedBy("unconfirmed")} · banned ${skippedBy("banned")} · test ${skippedBy("test")}`,
  );

  const queue: {
    recipient: GeneralRecipient | PilotRecipient;
    message: EmailMessage;
  }[] = [];
  if (args.group !== "pilot") {
    for (const g of r.general)
      queue.push({
        recipient: g,
        message: plans2027NoticeEmail({ to: g.email }),
      });
  }
  if (args.group !== "general") {
    if (args.send && !PILOT_NOTICE_APPROVED)
      fail(
        "The pilot wording is not approved yet (PILOT_NOTICE_APPROVED). Send --group general, or get Cj's yes first.",
      );
    for (const p of r.pilot) {
      // `r.pilot` holds only teams with an end date; this narrows the type.
      if (!p.pilotEndsOn) continue;
      queue.push({
        recipient: p,
        message: plans2027PilotNoticeEmail({
          to: p.email,
          programName: p.programName,
          programId: p.programId,
          pilotEndsOn: p.pilotEndsOn,
        }),
      });
    }
  }

  if (!args.send) {
    console.log(
      `\nDry run (--group ${args.group}): ${queue.length} would be mailed. Nothing was sent.`,
    );
    console.log(
      `To send: --group ${args.group} --send --confirm ${queue.length}`,
    );
    return;
  }
  if (args.confirm !== queue.length)
    fail(
      `--confirm ${args.confirm ?? "(missing)"} does not match the ${queue.length} this run would mail.`,
    );

  let sent = 0;
  let already = 0;
  const failed: string[] = [];
  for (const { recipient, message } of queue) {
    const key = noticeDedupeKey(recipient);
    const claim = await db
      .from("notification_sends")
      .upsert(
        { dedupe_key: key },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("dedupe_key");
    if (claim.error) {
      failed.push(`${redact(recipient.email)} (claim: ${claim.error.message})`);
      continue;
    }
    if (!claim.data?.length) {
      already++;
      continue;
    }
    const result = await sendEmail({ ...message, idempotencyKey: key });
    if (result.ok) sent++;
    else {
      failed.push(`${redact(recipient.email)} (${result.error})`);
      await db.from("notification_sends").delete().eq("dedupe_key", key);
    }
    // Two Resend calls a mail (suppression check + send), 2 req/s limit.
    await new Promise((res) => setTimeout(res, 1100));
  }

  console.log(
    `\nSent ${sent} · already sent ${already} · failed ${failed.length}`,
  );
  for (const f of failed) console.log(`  ✗ ${f}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
