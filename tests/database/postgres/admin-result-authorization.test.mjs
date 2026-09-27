import { test } from "node:test";
import assert from "node:assert/strict";
import { postgresHarness, role } from "../fixtures/postgres-harness.mjs";
import { setup, id } from "../fixtures/admin-schedule-harness.mjs";
import {
  dualRequest,
  tournamentRequest,
} from "../fixtures/admin-result-requests.mjs";

test("schedule batch and result target RLS permits admins only and exposes no browser mutations", async () => {
  const p = await postgresHarness();
  try {
    await setup(["20260919045138_save_admin_tournament_results.sql"], p.db);
    const session = await p.connect();
    await role(session, id(2));
    await session.query("select admin_prepare_dual_results($1,$2,$3,$4)", [
      id(2),
      id(100),
      id(10),
      dualRequest(),
    ]);
    await session.query("select admin_prepare_tournament_result($1,$2,$3,$4)", [
      id(2),
      id(200),
      id(10),
      tournamentRequest(200),
    ]);
    const tables = [
      "admin_dual_batches",
      "admin_schedule_result_targets",
      "admin_tournament_batches",
    ];
    for (const actor of [1, 2, 3]) {
      await role(session, id(actor), "authenticated");
      for (const table of tables) {
        const rows = (await session.query(`select * from ${table}`)).rows;
        assert.equal(rows.length > 0, actor !== 3);
        for (const sql of [
          `insert into ${table} default values`,
          `update ${table} set operation_id=operation_id`,
          `delete from ${table}`,
          `truncate ${table}`,
        ])
          await assert.rejects(() => session.query(sql), { code: "42501" });
      }
      for (const fn of [
        "admin_apply_dual_result",
        "admin_apply_tournament_result",
      ])
        await assert.rejects(
          () =>
            session.query(`select ${fn}($1,$2,$3)`, [id(2), id(100), id(101)]),
          { code: "42501" },
        );
    }
    await role(session, null, "anon");
    for (const table of tables)
      await assert.rejects(() => session.query(`select * from ${table}`), {
        code: "42501",
      });
    await role(session, id(3));
    await assert.rejects(
      () =>
        session.query("select admin_prepare_dual_results($1,$2,$3,$4)", [
          id(3),
          id(300),
          id(10),
          dualRequest(300),
        ]),
      /admin-required/,
    );
    await assert.rejects(
      () =>
        session.query("select admin_prepare_tournament_result($1,$2,$3,$4)", [
          id(3),
          id(300),
          id(10),
          tournamentRequest(300),
        ]),
      /admin-required/,
    );
  } finally {
    await p.close();
  }
});
