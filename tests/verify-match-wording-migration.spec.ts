import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The newest `verify_match` says who may verify as it is now: an admin or a
 * labeller (a labeller's publish verifies since label_publish_check). Read off
 * the migration file; nothing here touches a database.
 */

const dir = "supabase/migrations";
const file = readdirSync(dir).find((name) =>
  name.endsWith("_verify_match_refusal_wording.sql"),
);
const sql = file ? readFileSync(`${dir}/${file}`, "utf8") : "";

test("the refusal names admins and labellers", () => {
  expect(file).toBeTruthy();
  expect(sql).toContain(
    "'Only an Advantage admin or labeller can verify a match'",
  );
  expect(sql).toContain("(u.is_admin or u.is_labeller)");
});

test("it sorts after label_publish_check and stays service-role only", () => {
  expect(file! > "20261114091835_label_publish_check.sql").toBe(true);
  expect(sql).toMatch(
    /revoke execute on function public\.verify_match\(uuid, uuid, boolean\) from public, anon, authenticated;/,
  );
  expect(sql).toMatch(
    /grant execute on function public\.verify_match\(uuid, uuid, boolean\) to service_role;/,
  );
  expect(sql).not.toMatch(/to (anon|authenticated)\b/);
});
