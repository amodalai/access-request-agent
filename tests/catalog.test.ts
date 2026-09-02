import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PEOPLE, PRIVILEGED_ROLE_IDS, REQUESTER, ROLES, SOD_PAIRS, conflictsOf, entitlementKey, roleLabel, roleOf, slug } from "../amodal/_lib/catalog.js";
import { POLICY } from "../amodal/_lib/policy.js";

const hookConfig = (JSON.parse(readFileSync(new URL("../hooks/access-guard/hook.json", import.meta.url), "utf8")) as {
  config: { privilegedMaxDays: number; standardMaxDays: number; privilegedRoles: string[]; sodPairs: Array<[string, string]> };
}).config;

test("role ids are unique and every pair names two different catalog roles", () => {
  const ids = ROLES.map((r) => r.role_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [a, b] of SOD_PAIRS) {
    assert.ok(roleOf(a) && roleOf(b), `${a} / ${b}`);
    assert.notEqual(a, b);
  }
});

test("conflicts are symmetric and empty for unpaired roles", () => {
  assert.deepEqual(conflictsOf("netsuite.ap_clerk"), ["netsuite.ap_approver"]);
  assert.deepEqual(conflictsOf("netsuite.ap_approver"), ["netsuite.ap_clerk"]);
  assert.deepEqual(conflictsOf("netsuite.gl_read"), []);
  assert.deepEqual(conflictsOf("nope"), []);
});

test("the guard hook's config mirrors the catalog and the policy", () => {
  assert.deepEqual(hookConfig.privilegedRoles, PRIVILEGED_ROLE_IDS);
  assert.deepEqual(hookConfig.sodPairs, SOD_PAIRS);
  assert.equal(hookConfig.privilegedMaxDays, POLICY.privileged_max_days);
  assert.equal(hookConfig.standardMaxDays, POLICY.standard_max_days);
});

test("the requester persona is a known person, and keys and labels are derived the same way everywhere", () => {
  assert.ok(PEOPLE[REQUESTER]);
  assert.equal(slug("Priya Nair (Finance)"), "priya_nair_finance");
  assert.equal(entitlementKey("Priya Nair (Finance)", "netsuite.ap_clerk"), "ent_priya_nair_finance_netsuite_ap_clerk");
  assert.equal(roleLabel(roleOf("aws.prod_admin")!), "AWS Production Prod Admin");
});
