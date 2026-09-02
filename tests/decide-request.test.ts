import { test } from "node:test";
import assert from "node:assert/strict";
import decide_request from "../amodal/tools/decide_request/handler.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";
import { assertDeclared, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const TOM_DEV = "ent_tom_becker_engineering_github_developer";

function seededCtx(opts: { reviewed?: string[]; recommendation?: string } = {}) {
  const { store, calls, callTool } = fakeStore(NOW);
  for (const id of opts.reviewed ?? []) {
    store.set(`reviews:rev_${id}`, { review_id: `rev_${id}`, request_id: id, revision: 1, recommendation: opts.recommendation ?? "grant" });
    store.set(`requests:${id}`, { ...store.get(`requests:${id}`)!, status: "reviewed", review_id: `rev_${id}` });
  }
  const ctx: CustomToolContext = { log() {}, signal: new AbortController().signal, now: () => Date.parse(NOW), callTool };
  return { ctx, store, calls };
}

test("granting a clean reviewed request stamps it and writes the entitlement to the end date", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_tom_github_developer"] });
  const out = await decide_request({ request_id: "req_tom_github_developer", decision: "granted", note: " ok " }, ctx);
  assert.deepEqual(out, { request_id: "req_tom_github_developer", decision: "granted", role_id: "github.developer", expires_at: "2027-08-31T00:00:00.000Z" });
  const req = store.get("requests:req_tom_github_developer")!;
  assert.equal(req.status, "granted");
  assert.equal(req.decided_at, NOW);
  assert.equal(req.decision_note, "ok");
  const ent = store.get(`entitlements:${TOM_DEV}`)!;
  assert.deepEqual(
    [ent.entitlement_id, ent.person, ent.role_id, ent.system, ent.role, ent.sensitivity, ent.granted_at, ent.expires_at, ent.source_request_id, ent.status],
    [TOM_DEV, "Tom Becker (Engineering)", "github.developer", "GitHub", "Developer", "standard", NOW, "2027-08-31T00:00:00.000Z", "req_tom_github_developer", "active"],
  );
});

test("a re-grant replaces the expired row for the same person and role", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_tom_github_developer"] });
  store.set(`entitlements:${TOM_DEV}`, { entitlement_id: TOM_DEV, person: "Tom Becker (Engineering)", role_id: "github.developer", status: "expired", expires_at: "2026-01-01T00:00:00.000Z" });
  await decide_request({ request_id: "req_tom_github_developer", decision: "granted" }, ctx);
  assert.equal(store.get(`entitlements:${TOM_DEV}`)!.status, "active");
  assert.equal([...store.keys()].filter((k) => k.startsWith("entitlements:") && k.includes("github_developer") && k.includes("tom")).length, 1);
});

test("denying needs a review but re-checks nothing, and writes no entitlement", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_priya_netsuite_ap_approver"] });
  const before = [...store.keys()].filter((k) => k.startsWith("entitlements:")).length;
  await decide_request({ request_id: "req_priya_netsuite_ap_approver", decision: "denied" }, ctx);
  assert.equal(store.get("requests:req_priya_netsuite_ap_approver")!.status, "denied");
  assert.equal(store.get("requests:req_priya_netsuite_ap_approver")!.decision_note, null);
  assert.equal([...store.keys()].filter((k) => k.startsWith("entitlements:")).length, before);
});

test("refuses to grant when a hard rule fails", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_priya_netsuite_ap_approver", "req_tom_github_developer_again", "req_sofia_snowflake_analyst"] });
  await assert.rejects(
    decide_request({ request_id: "req_priya_netsuite_ap_approver", decision: "granted" }, ctx),
    /Cannot grant req_priya_netsuite_ap_approver: conflicts with NetSuite AP Clerk/,
  );
  await assert.rejects(
    decide_request({ request_id: "req_tom_github_developer_again", decision: "granted" }, ctx),
    /duplicate of open request req_tom_github_developer/,
  );
  await assert.rejects(
    decide_request({ request_id: "req_sofia_snowflake_analyst", decision: "granted" }, ctx),
    /425 days requested, over the 365-day limit/,
  );
  assert.equal(store.get("requests:req_priya_netsuite_ap_approver")!.status, "reviewed");
  assert.equal(store.has("entitlements:ent_priya_nair_finance_netsuite_ap_approver"), false);
});

test("refuses unreviewed, unknown, already-decided, and malformed input", async () => {
  const { ctx } = seededCtx({ reviewed: ["req_tom_github_developer"] });
  await assert.rejects(decide_request({ request_id: "req_tom_aws_prod_admin", decision: "granted" }, ctx), /is new; only a reviewed request/);
  await assert.rejects(decide_request({ request_id: "req_nope", decision: "granted" }, ctx), /not found/);
  await assert.rejects(decide_request({ request_id: "req_tom_github_developer", decision: "provisioned" }, ctx), /must be "granted", "denied", or "returned"/);
  await assert.rejects(decide_request({ decision: "granted" }, ctx), /No request_id/);
  await decide_request({ request_id: "req_tom_github_developer", decision: "granted" }, ctx);
  await assert.rejects(decide_request({ request_id: "req_tom_github_developer", decision: "denied" }, ctx), /is granted; only a reviewed request/);
  await assert.rejects(decide_request({ request_id: "req_tom_github_developer", decision: "returned", note: "x" }, ctx), /is granted; only a reviewed request/);
});

test("refuses a reviewed request whose review row is missing", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_tom_github_developer"] });
  store.delete("reviews:rev_req_tom_github_developer");
  await assert.rejects(decide_request({ request_id: "req_tom_github_developer", decision: "denied" }, ctx), /No review for req_tom_github_developer/);
});

test("returning needs a note, sends the request back with it, and can be resubmitted but not decided", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_sofia_workday_hr_read"] });
  await assert.rejects(decide_request({ request_id: "req_sofia_workday_hr_read", decision: "returned" }, ctx), /needs a note/);
  await assert.rejects(decide_request({ request_id: "req_sofia_workday_hr_read", decision: "returned", note: "  " }, ctx), /needs a note/);
  const out = await decide_request({ request_id: "req_sofia_workday_hr_read", decision: "returned", note: "The org chart is in the directory." }, ctx);
  assert.equal(out.decision, "returned");
  assert.equal(out.expires_at, null);
  const req = store.get("requests:req_sofia_workday_hr_read")!;
  assert.equal(req.status, "returned");
  assert.equal(req.returned_note, "The org chart is in the directory.");
  assert.equal(req.decided_at, null);
  assert.equal(req.decision_note, null);
  await assert.rejects(decide_request({ request_id: "req_sofia_workday_hr_read", decision: "granted" }, ctx), /is returned; only a reviewed request/);
});

test("granting against an escalate recommendation needs a note", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["req_tom_aws_prod_admin"], recommendation: "escalate" });
  await assert.rejects(decide_request({ request_id: "req_tom_aws_prod_admin", decision: "granted" }, ctx), /escalate recommendation needs a note/);
  await decide_request({ request_id: "req_tom_aws_prod_admin", decision: "granted", note: "Security signed off." }, ctx);
  assert.equal(store.get("requests:req_tom_aws_prod_admin")!.status, "granted");
  assert.equal(store.get("entitlements:ent_tom_becker_engineering_aws_prod_admin")!.expires_at, "2026-09-16T00:00:00.000Z");
});

test("each decision appends exactly one event with actor approver, the note, and the revision", async () => {
  const { ctx, store, calls } = seededCtx({ reviewed: ["req_tom_github_developer", "req_priya_netsuite_ap_approver", "req_sofia_workday_hr_read"] });
  store.set("requests:req_sofia_workday_hr_read", { ...store.get("requests:req_sofia_workday_hr_read")!, revision: 2 });
  await decide_request({ request_id: "req_tom_github_developer", decision: "granted" }, ctx);
  await decide_request({ request_id: "req_priya_netsuite_ap_approver", decision: "denied", note: "Segregation of duties." }, ctx);
  await decide_request({ request_id: "req_sofia_workday_hr_read", decision: "returned", note: "Ask for the directory instead." }, ctx);
  await assert.rejects(decide_request({ request_id: "req_sofia_workday_hr_read", decision: "denied" }, ctx));
  const events = [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  assert.deepEqual(
    events.map((e) => [e.request_id, e.kind, e.actor, e.note, e.revision, e.created_at]),
    [
      ["req_tom_github_developer", "granted", "approver", null, 1, NOW],
      ["req_priya_netsuite_ap_approver", "denied", "approver", "Segregation of duties.", 1, NOW],
      ["req_sofia_workday_hr_read", "returned", "approver", "Ask for the directory instead.", 2, NOW],
    ],
  );
  assertDeclared("decide_request", calls.map(([n]) => n));
});

test("a demo id missing from the stores is not found: only the review self-seeds", async () => {
  const { ctx, store, calls } = seededCtx();
  store.clear();
  await assert.rejects(decide_request({ request_id: "req_tom_github_developer", decision: "denied" }, ctx), /not found/);
  assert.equal(store.size, 0);
  assertDeclared("decide_request", calls.map(([n]) => n));
});
