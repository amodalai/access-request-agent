import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRequest,
  clampRecommendation,
  findDuplicate,
  floorRecommendation,
  grantBlockers,
  parseReviewResult,
  runRequestReview,
  storeGetResult,
  type EntitlementRow,
  type RequestRow,
} from "../amodal/_lib/access-review.js";
import { REQUESTS, requestRow, seedRows } from "../amodal/_lib/demo-data.js";
import { fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const req = (id: string): RequestRow => requestRow(REQUESTS.find((r) => r.request_id === id)!, NOW);
const all = REQUESTS.map((r) => requestRow(r, NOW));
const held = seedRows(NOW).entitlements as EntitlementRow[];

test("the later open request for the same person and role is the duplicate, never the original", () => {
  assert.equal(findDuplicate(req("req_tom_github_developer_again"), all)?.request_id, "req_tom_github_developer");
  assert.equal(findDuplicate(req("req_tom_github_developer"), all), undefined);
  const decided = all.map((r) => (r.request_id === "req_tom_github_developer" ? { ...r, status: "granted" } : r));
  assert.equal(findDuplicate(req("req_tom_github_developer_again"), decided), undefined, "a decided request is not an open duplicate");
  const same = { ...req("req_tom_github_developer"), request_id: "req_a", received_at: NOW };
  const other = { ...same, request_id: "req_b" };
  assert.equal(findDuplicate(other, [same])?.request_id, "req_a");
  assert.equal(findDuplicate(same, [other]), undefined);
});

test("the floor and the blockers follow the facts", () => {
  const clean = checkRequest(req("req_tom_github_developer"), held, all);
  assert.deepEqual(grantBlockers(clean, req("req_tom_github_developer")), []);
  assert.equal(floorRecommendation(clean), "grant");

  const sod = checkRequest(req("req_priya_netsuite_ap_approver"), held, all);
  assert.deepEqual(sod.conflicts_with, ["NetSuite AP Clerk"]);
  assert.deepEqual(sod.held, ["NetSuite AP Clerk", "Snowflake Analyst"]);
  assert.equal(floorRecommendation(sod), "deny");
  assert.match(grantBlockers(sod, req("req_priya_netsuite_ap_approver"))[0], /conflicts with NetSuite AP Clerk, which the requester already holds/);

  const priv = checkRequest(req("req_tom_aws_prod_admin"), held, all);
  assert.equal(priv.sensitivity, "privileged");
  assert.deepEqual(grantBlockers(priv, req("req_tom_aws_prod_admin")), []);
  assert.equal(floorRecommendation(priv), "escalate");

  const long = checkRequest(req("req_sofia_snowflake_analyst"), held, all);
  assert.equal(long.math.over_by_days, 60);
  assert.equal(floorRecommendation(long), "limit");
  assert.match(grantBlockers(long, req("req_sofia_snowflake_analyst"))[0], /425 days requested, over the 365-day limit for standard roles/);

  const dup = checkRequest(req("req_tom_github_developer_again"), held, all);
  assert.equal(dup.duplicate_of, "req_tom_github_developer");
  assert.equal(floorRecommendation(dup), "deny");

  const mine = { ...req("req_tom_github_developer"), role_id: "aws.prod_read", system: "AWS Production", role: "Prod Read" };
  const already = checkRequest(mine, held, all);
  assert.equal(already.already_held, true);
  assert.equal(floorRecommendation(already), "deny");
  assert.match(grantBlockers(already, mine)[0], /already holds AWS Production Prod Read/);

  const unknown = checkRequest({ ...mine, role_id: "nope.role" }, held, all);
  assert.equal(unknown.role_found, false);
  assert.equal(floorRecommendation(unknown), "deny");

  const backwards = checkRequest({ ...req("req_tom_github_developer"), end_date: "2026-08-01" }, held, all);
  assert.equal(floorRecommendation(backwards), "limit");
  assert.match(grantBlockers(backwards, req("req_tom_github_developer"))[0], /end date is not after the start date/);
});

test("an expired role neither conflicts nor counts as held", () => {
  const expired = held.map((e) => (e.person === "Priya Nair (Finance)" ? { ...e, status: "expired" as const } : e));
  const f = checkRequest(req("req_priya_netsuite_ap_approver"), expired, all);
  assert.deepEqual([f.conflicts_with, f.held, f.already_held], [[], [], false]);
  assert.equal(floorRecommendation(f), "grant");
});

test("clamping keeps the reviewer's call unless the floor is more conservative", () => {
  const clean = checkRequest(req("req_tom_github_developer"), held, all);
  assert.equal(clampRecommendation("grant", clean), "grant");
  assert.equal(clampRecommendation("limit", clean), "limit");
  for (const bad of ["nonsense", "toString", "constructor", "__proto__", ""]) {
    assert.equal(clampRecommendation(bad, clean), "limit", JSON.stringify(bad));
  }
  const priv = checkRequest(req("req_tom_aws_prod_admin"), held, all);
  assert.equal(clampRecommendation("grant", priv), "escalate");
  assert.equal(clampRecommendation("deny", priv), "deny");
});

test("parses the reviewer's JSON even when wrapped in fences or prose", () => {
  const r = parseReviewResult('Here you go:\n```json\n{"recommendation":"limit","summary":"s","checks":[],"issues":["a"]}\n```');
  assert.equal(r.recommendation, "limit");
  assert.deepEqual(r.issues, ["a"]);
  assert.throws(() => parseReviewResult("no json here"), /no JSON object/);
  assert.throws(() => parseReviewResult('{"summary":"x"}'), /missing a string/);
});

test("storeGetResult treats the runtime's error envelope as missing", () => {
  assert.equal(storeGetResult({ error: "not found" }), undefined);
  assert.equal(storeGetResult(null), undefined);
  assert.deepEqual(storeGetResult({ request_id: "x" }), { request_id: "x" });
});

function fakeDeps(reviewerReply: string, seedAt?: string) {
  const { store, calls, callTool } = fakeStore(seedAt);
  const traces: string[] = [];
  const inputs: unknown[] = [];
  return {
    store,
    calls,
    traces,
    inputs,
    deps: {
      callTool,
      async callSubagent(_ref: string, _task: string, input?: unknown) {
        inputs.push(input);
        return reviewerReply;
      },
      async loadPolicy() {
        return "# policy";
      },
      now: () => new Date(NOW),
      sessionId: "sess",
      trace: (l: string) => traces.push(l),
    },
  };
}

const REPLY = JSON.stringify({
  recommendation: "grant",
  summary: "Looks fine.",
  checks: [{ name: "duration", status: "pass", note: "ok" }],
  issues: [],
});

test("on fresh stores the review seeds the dataset and reviews the in-memory example with its holder's access", async () => {
  const { deps, store, calls, inputs } = fakeDeps(REPLY);
  const out = await runRequestReview("req_priya_netsuite_ap_approver", deps);
  assert.equal(out.found, true);
  assert.equal(out.recommendation, "deny", "the seeded AP Clerk entitlement reaches the in-memory review");
  const review_id = `rev_req_priya_netsuite_ap_approver_1_${Date.parse(NOW)}`;
  assert.equal(out.review_id, review_id);
  assert.ok(calls.some(([n, a]) => n === "store__requests__set" && a.key === "req_tom_snowflake_analyst"), "seeded the dataset");
  const saved = store.get("requests:req_priya_netsuite_ap_approver")!;
  assert.equal(saved.status, "reviewed");
  assert.equal(saved.recommendation, "deny");
  assert.equal(saved.review_id, review_id);
  assert.equal(saved.reviewed_at, NOW);
  const review = store.get(`reviews:${review_id}`)!;
  assert.equal(review.reviewer_session_id, "sess");
  assert.equal(review.revision, 1);
  const input = inputs[0] as { existing_access: Array<{ role: string }>; facts: { conflicts_with: string[] }; role: { purpose: string } };
  assert.deepEqual(input.existing_access.map((e) => e.role), ["AP Clerk", "Analyst"]);
  assert.deepEqual(input.facts.conflicts_with, ["NetSuite AP Clerk"]);
  assert.match(input.role.purpose, /Approve vendor bills/);
});

test("every run keeps its own review row, the request names the latest, and a reviewed event is appended", async () => {
  let t = Date.parse(NOW);
  const { deps, store } = fakeDeps(REPLY, NOW);
  deps.now = () => new Date(t);
  const first = await runRequestReview("req_tom_aws_prod_admin", deps);
  t += 60_000;
  const second = await runRequestReview("req_tom_aws_prod_admin", deps);
  assert.notEqual(first.review_id, second.review_id);
  assert.ok(store.has(`reviews:${first.review_id}`) && store.has(`reviews:${second.review_id}`));
  assert.equal(store.get("requests:req_tom_aws_prod_admin")!.review_id, second.review_id);
  const events = [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => [e.kind, e.actor, e.recommendation, e.revision, e.request_id]),
    [["reviewed", "agent", "escalate", 1, "req_tom_aws_prod_admin"], ["reviewed", "agent", "escalate", 1, "req_tom_aws_prod_admin"]],
  );
});

test("a preloaded request is reviewed without reading the stores", async () => {
  const { deps, store, calls } = fakeDeps(REPLY);
  const request = { ...req("req_tom_github_developer"), revision: 2 };
  const out = await runRequestReview("req_tom_github_developer", deps, { request, held: [], others: [] });
  assert.equal(out.recommendation, "grant");
  assert.ok(!calls.some(([n]) => n.endsWith("__get") || n.endsWith("__query")));
  assert.equal(store.get(`reviews:${out.review_id}`)!.revision, 2);
  assert.equal(store.get("requests:req_tom_github_developer")!.status, "reviewed");
});

test("code clamps a grant the facts forbid and folds the blockers into the issues", async () => {
  const { deps, traces } = fakeDeps(REPLY);
  const out = await runRequestReview("req_sofia_snowflake_analyst", deps);
  assert.equal(out.recommendation, "limit");
  assert.match(out.issues![0], /over the 365-day limit/);
  assert.ok(traces.some((t) => t.includes("clamped the recommendation from `grant` to `limit`")));
});

test("a duplicate is denied whatever the reviewer says, from the stored rows", async () => {
  const { deps } = fakeDeps(REPLY, NOW);
  const out = await runRequestReview("req_tom_github_developer_again", deps);
  assert.equal(out.recommendation, "deny");
  assert.equal(out.issues![0], "duplicate of open request req_tom_github_developer");
});

test("an unknown request reports found: false without writing", async () => {
  const { deps, calls } = fakeDeps(REPLY);
  assert.deepEqual(await runRequestReview("req_nope", deps), { found: false, request_id: "req_nope" });
  assert.ok(!calls.some(([n]) => n.endsWith("__set")));
});
