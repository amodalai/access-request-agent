import { test } from "node:test";
import assert from "node:assert/strict";
import { submitRequest, validateSubmission } from "../amodal/_lib/submit.js";
import { REQUESTS, requestRow } from "../amodal/_lib/demo-data.js";
import { assertDeclared, assertUsesReachable, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const PRIYA = "Priya Nair (Finance)";
const REPLY = JSON.stringify({ recommendation: "grant", summary: "Fine.", checks: [], issues: [] });

const form = {
  role_id: "netsuite.gl_read",
  start_date: "2026-09-01",
  end_date: "2026-12-31",
  justification: " Month-end close reporting for the FP&A pack. ",
  ticket: "",
  notes: "",
  requester: PRIYA,
};

function fakeDeps(reviewerReply = REPLY) {
  const { store, calls, callTool } = fakeStore(NOW);
  let subagentCalls = 0;
  let r = 0;
  const deps = {
    callTool,
    async callSubagent() {
      subagentCalls += 1;
      if (reviewerReply === "THROW") throw new Error("reviewer down");
      return reviewerReply;
    },
    async loadPolicy() {
      return "# policy";
    },
    now: () => new Date(NOW),
    random: () => (r += 0.1) % 1,
    sessionId: "sess",
  };
  const events = () => [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  return { deps, store, calls, events, subagentCalls: () => subagentCalls };
}

test("validation names every problem at once and normalizes the fields", () => {
  assert.throws(
    () => validateSubmission({ role_id: "nope.role", requester: "Nobody", start_date: "1 Sep", justification: " " }),
    (e: Error) => {
      for (const part of [
        "role_id nope.role is not in the catalog",
        "requester Nobody is not a known employee",
        "start_date must be a date as YYYY-MM-DD",
        "end_date is required",
        "justification is required",
      ]) {
        assert.ok(e.message.includes(part), part);
      }
      return true;
    },
  );
  assert.throws(() => validateSubmission({ ...form, end_date: "2026-09-01" }), /end_date must be after start_date/);
  assert.throws(() => validateSubmission({ ...form, start_date: "2026-02-30" }), /start_date must be a date/);
  assert.throws(() => validateSubmission(null), /role_id is required/);
  const p = validateSubmission({ ...form, ticket: " ONB-1 ", request_id: " req_x " });
  assert.equal(p.justification, "Month-end close reporting for the FP&A pack.");
  assert.equal(p.ticket, "ONB-1");
  assert.equal(p.notes, null);
  assert.equal(p.request_id, "req_x");
  assert.equal("request_id" in validateSubmission(form), false);
  assert.equal(validateSubmission(form).ticket, null);
});

test("a new submission writes the denormalized row, appends submitted, and reviews the in-memory row", async () => {
  const { deps, store, calls, events, subagentCalls } = fakeDeps();
  const out = await submitRequest(form, deps);
  assert.equal(out.request_id, "req_priya_nair_finance_netsuite_gl_read");
  assert.equal(out.revision, 1);
  assert.equal(out.recommendation, "grant");
  const row = store.get("requests:req_priya_nair_finance_netsuite_gl_read")!;
  assert.equal(row.status, "reviewed");
  assert.equal(row.review_id, out.review_id);
  assert.deepEqual([row.requester, row.manager, row.system, row.role, row.sensitivity], [PRIYA, "Dana Whitfield (Finance)", "NetSuite", "GL Read", "standard"]);
  assert.equal(row.received_at, NOW);
  assert.equal(row.submitted_at, NOW);
  assert.equal(row.revision, 1);
  const written = calls.findIndex(([n, a]) => n === "store__requests__set" && a.key === out.request_id);
  assert.ok(!calls.slice(written).some(([n, a]) => n === "store__requests__get" && a.key === out.request_id), "never reads its own row back");
  assert.equal(subagentCalls(), 1);
  assert.deepEqual(events().map((e) => [e.kind, e.actor, e.revision]), [["submitted", PRIYA, 1], ["reviewed", "agent", 1]]);
  assertDeclared("submit_request", calls.map(([n]) => n));
});

test("a resent request gets its own row with a numeric suffix and is reviewed as a duplicate", async () => {
  const { deps, store, calls } = fakeDeps();
  const out = await submitRequest(form, deps);
  assert.equal(out.request_id, "req_priya_nair_finance_netsuite_gl_read");
  const again = await submitRequest(form, deps);
  assert.equal(again.request_id, "req_priya_nair_finance_netsuite_gl_read_2");
  assert.equal(again.recommendation, "deny");
  assert.ok(store.has("requests:req_priya_nair_finance_netsuite_gl_read") && store.has("requests:req_priya_nair_finance_netsuite_gl_read_2"));
  assertDeclared("submit_request", calls.map(([n]) => n));
});

test("the requester's existing access reaches the review", async () => {
  const { deps } = fakeDeps();
  const out = await submitRequest({ ...form, role_id: "netsuite.ap_approver" }, deps);
  assert.equal(out.recommendation, "deny", "Priya holds AP Clerk");
});

test("a resubmission replaces a returned request at revision + 1 and clears the return", async () => {
  const { deps, store, events, calls } = fakeDeps();
  const returned = requestRow({ ...REQUESTS[1], request_id: "req_x" }, "2026-08-01T00:00:00.000Z");
  store.set("requests:req_x", {
    ...returned,
    status: "returned",
    returned_note: "ask for GL Read",
    recommendation: "deny",
    review_id: "rev_old",
    reviewed_at: "2026-08-02T00:00:00.000Z",
  });
  const out = await submitRequest({ ...form, request_id: "req_x" }, deps);
  assert.equal(out.request_id, "req_x");
  assert.equal(out.revision, 2);
  const row = store.get("requests:req_x")!;
  assert.equal(row.revision, 2);
  assert.equal(row.status, "reviewed");
  assert.equal(row.returned_note, null);
  assert.equal(row.role_id, "netsuite.gl_read");
  assert.equal(row.role, "GL Read");
  assert.equal(row.submitted_at, NOW);
  assert.equal(row.received_at, returned.received_at);
  assert.equal(row.created_at, "2026-08-01T00:00:00.000Z");
  assert.notEqual(row.review_id, "rev_old");
  assert.deepEqual(events().map((e) => [e.kind, e.revision]), [["resubmitted", 2], ["reviewed", 2]]);
  assertDeclared("submit_request", calls.map(([n]) => n));
});

test("a resubmission is refused unless the request is returned", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(submitRequest({ ...form, request_id: "req_nope" }, deps), /not found/);
  await assert.rejects(submitRequest({ ...form, request_id: "req_priya_netsuite_ap_approver" }, deps), /is new; only a returned request/);
});

test("a failing review leaves the request new, with its submitted event, and rethrows", async () => {
  const { deps, store, events } = fakeDeps("THROW");
  await assert.rejects(submitRequest(form, deps), /reviewer down/);
  const row = store.get("requests:req_priya_nair_finance_netsuite_gl_read")!;
  assert.equal(row.status, "new");
  assert.equal(row.review_id, null);
  assert.deepEqual(events().map((e) => e.kind), ["submitted"]);
});

test("submit_request declares no store tool its runs cannot reach", () => {
  assertUsesReachable("submit_request");
});
