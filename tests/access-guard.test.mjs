import { test } from "node:test";
import assert from "node:assert/strict";
import { createHook } from "../hooks/access-guard/index.mjs";

const hook = createHook({
  privilegedMaxDays: 30,
  standardMaxDays: 365,
  privilegedRoles: ["aws.prod_admin", "okta.admin"],
  sodPairs: [["netsuite.ap_clerk", "netsuite.ap_approver"]],
});

function ctx(rows) {
  const field = { requests: "request_id", entitlements: "entitlement_id" };
  return {
    log() {},
    store: {
      async get(store, key) {
        return rows[store]?.find((r) => r[field[store]] === key) ?? null;
      },
      async query(store, filter = {}) {
        return (rows[store] ?? []).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
      },
    },
  };
}

const write = (toolName, value) => ({ toolName, args: { key: value.request_id ?? value.review_id ?? value.entitlement_id, value } });
const PRIYA = "Priya Nair (Finance)";
const tom = {
  request_id: "req_tom_github_developer",
  requester: "Tom Becker (Engineering)",
  role_id: "github.developer",
  start_date: "2026-09-01",
  end_date: "2027-08-31",
};
const priya = { request_id: "req_priya_netsuite_ap_approver", requester: PRIYA, role_id: "netsuite.ap_approver", start_date: "2026-09-01", end_date: "2026-12-31" };
const clerk = { entitlement_id: "ent_priya_clerk", person: PRIYA, role_id: "netsuite.ap_clerk", status: "active" };

test("ignores other tools, other points, non-grant writes, and expired entitlements", async () => {
  const c = ctx({ entitlements: [clerk], requests: [priya] });
  assert.equal((await hook.run("postToolUse", write("store__requests__set", { ...priya, status: "granted" }), c)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...priya, status: "reviewed", recommendation: "deny" }), c)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...priya, status: "returned" }), c)).action, "allow");
  const event = { event_id: "evt_1", request_id: priya.request_id, kind: "reviewed", actor: "agent", recommendation: "grant" };
  assert.equal((await hook.run("preToolUse", { toolName: "store__events__set", args: { key: event.event_id, value: event } }, c)).action, "allow");
  const expired = { entitlement_id: "ent_priya_approver", person: PRIYA, role_id: "netsuite.ap_approver", status: "expired" };
  assert.equal((await hook.run("preToolUse", write("store__entitlements__set", expired), c)).action, "allow");
});

test("allows a clean grant and blocks one over the limit for its sensitivity", async () => {
  const c = ctx({ entitlements: [], requests: [tom] });
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...tom, status: "granted" }), c)).action, "allow");
  const long = await hook.run("preToolUse", write("store__requests__set", { ...tom, end_date: "2027-10-31", recommendation: "grant" }), c);
  assert.equal(long.action, "block");
  assert.match(long.reason, /425 days is over the 365-day limit for standard roles/);
  const priv = await hook.run("preToolUse", write("store__requests__set", { ...tom, role_id: "aws.prod_admin", start_date: "2026-09-01", end_date: "2026-10-02", status: "granted" }), c);
  assert.equal(priv.action, "block");
  assert.match(priv.reason, /31 days is over the 30-day limit for privileged roles/);
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...tom, role_id: "aws.prod_admin", end_date: "2026-10-01", status: "granted" }), c)).action, "allow");
});

test("blocks a segregation-of-duties conflict on the request, the review, and the entitlement write", async () => {
  const c = ctx({ entitlements: [clerk], requests: [priya] });
  const d = await hook.run("preToolUse", write("store__requests__set", { ...priya, status: "granted" }), c);
  assert.equal(d.action, "block");
  assert.match(d.reason, /netsuite\.ap_approver conflicts with netsuite\.ap_clerk, which Priya Nair \(Finance\) already holds/);
  const r = await hook.run("preToolUse", write("store__reviews__set", { review_id: "rev_x", request_id: priya.request_id, recommendation: "grant" }), c);
  assert.equal(r.action, "block");
  const e = await hook.run("preToolUse", write("store__entitlements__set", { entitlement_id: "ent_priya_approver", person: PRIYA, role_id: "netsuite.ap_approver", status: "active" }), c);
  assert.equal(e.action, "block");
  assert.equal((await hook.run("preToolUse", write("store__entitlements__set", { ...clerk }), c)).action, "allow", "re-granting the held role is not a conflict with itself");
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...priya, role_id: "netsuite.gl_read", status: "granted" }), c)).action, "allow");
});

test("passes what it cannot see yet (fresh stores) and blocks without a store reader", async () => {
  const fresh = ctx({});
  assert.equal((await hook.run("preToolUse", write("store__reviews__set", { review_id: "rev_x", request_id: "req_x", recommendation: "grant" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...priya, status: "granted" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__requests__set", { ...priya, status: "granted" }), { log() {} })).action, "block");
});
