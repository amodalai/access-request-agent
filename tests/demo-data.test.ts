import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_NOW, REQUESTS, STORE_KEYS, ensureExamplesSeeded, requestRow, seedRows } from "../amodal/_lib/demo-data.js";
import { BACKLOG, BASELINE_ENTITLEMENTS } from "../amodal/_lib/examples.js";
import { PEOPLE, SOD_PAIRS, entitlementKey, roleOf } from "../amodal/_lib/catalog.js";
import { accessMath, dayIso } from "../amodal/_lib/policy.js";
import { assertDeclared } from "./helpers.js";

const NOW = "2026-09-01T00:00:00.000Z";
const ALL_REQUESTS = [...REQUESTS, ...BACKLOG];
const rowsOf = (store: keyof typeof STORE_KEYS) => seedRows(NOW)[store];
const allRows = () => Object.entries(seedRows(NOW)).map(([store, rows]) => ({ store, field: STORE_KEYS[store as keyof typeof STORE_KEYS], rows }));

test("every demo request names a known person and a catalog role, with a window that ends after it starts", () => {
  for (const r of ALL_REQUESTS) {
    assert.ok(PEOPLE[r.requester], r.request_id);
    assert.ok(roleOf(r.role_id), r.request_id);
    assert.ok(r.end_date > r.start_date, r.request_id);
  }
  for (const e of BASELINE_ENTITLEMENTS) {
    assert.ok(PEOPLE[e.person] && roleOf(e.role_id), `${e.person} ${e.role_id}`);
  }
});

test("received_at follows the arrival offsets, so a resend comes after its original and the backlog predates the live set", () => {
  const at = (id: string) => requestRow(ALL_REQUESTS.find((r) => r.request_id === id)!, NOW).received_at;
  assert.ok(at("req_tom_github_developer") < at("req_tom_github_developer_again"));
  for (const r of BACKLOG) assert.ok(at(r.request_id) < at("req_tom_github_developer"), `${r.request_id} predates the live set`);
});

test("no live request asks for a role its requester already holds, and seed keys are unique", () => {
  const active = rowsOf("entitlements").filter((e) => e.status === "active");
  for (const r of REQUESTS) {
    assert.ok(!active.some((e) => e.person === r.requester && e.role_id === r.role_id), r.request_id);
  }
  const ids = allRows().flatMap((s) => s.rows.map((r) => `${s.store}:${r[s.field]}`));
  assert.equal(new Set(ids).size, ids.length, "seed keys are unique");
});

test("every granted backlog request creates one entitlement to its end date, and every sourced entitlement points back at a grant", () => {
  const entitlements = rowsOf("entitlements");
  for (const r of BACKLOG.filter((b) => b.decided === "granted")) {
    const ent = entitlements.find((e) => e.entitlement_id === entitlementKey(r.requester, r.role_id));
    assert.ok(ent, r.request_id);
    assert.equal(ent.expires_at, dayIso(r.end_date), r.request_id);
    assert.equal(ent.source_request_id, r.request_id);
    assert.equal(ent.sensitivity, roleOf(r.role_id)!.sensitivity);
  }
  for (const e of entitlements.filter((e) => e.source_request_id)) {
    const r = rowsOf("requests").find((q) => q.request_id === e.source_request_id);
    assert.equal(r?.status, "granted", String(e.entitlement_id));
  }
  assert.equal(entitlements.length, BASELINE_ENTITLEMENTS.length + BACKLOG.filter((b) => b.decided === "granted").length);
});

test("entitlement status follows the demo clock", () => {
  const byId = new Map(rowsOf("entitlements").map((e) => [e.entitlement_id, e]));
  assert.equal(byId.get("ent_ravi_menon_engineering_okta_admin")!.status, "expired");
  assert.equal(byId.get("ent_priya_nair_finance_netsuite_ap_clerk")!.status, "active");
  for (const e of byId.values()) assert.equal(e.status, String(e.expires_at) > DEMO_NOW ? "active" : "expired", String(e.entitlement_id));
});

// The access-guard hook fires on every seeded `granted` row and every active
// entitlement and, on a reset, sees the previous dataset's rows. Each grant
// must pass the hook's rules against the final entitlements or the seed is blocked.
test("every seeded grant passes the guard hook's rules against the final entitlements", () => {
  const active = rowsOf("entitlements").filter((e) => e.status === "active");
  for (const e of active) {
    for (const [a, b] of SOD_PAIRS) {
      const other = e.role_id === a ? b : e.role_id === b ? a : null;
      if (other) assert.ok(!active.some((o) => o.person === e.person && o.role_id === other), `${e.person} holds ${a} and ${b}`);
    }
  }
  for (const r of rowsOf("requests").filter((q) => q.status === "granted")) {
    const m = accessMath({ start_date: String(r.start_date), end_date: String(r.end_date), sensitivity: roleOf(String(r.role_id))!.sensitivity });
    assert.ok(m.within_limit, String(r.request_id));
  }
});

test("each backlog request is decided, with a canned review per revision and its events in order", () => {
  const reviews = rowsOf("reviews");
  const events = rowsOf("events");
  for (const r of BACKLOG) {
    const row = rowsOf("requests").find((q) => q.request_id === r.request_id)!;
    const mine = reviews.filter((v) => v.request_id === r.request_id);
    assert.equal(mine.length, r.reviews.length, r.request_id);
    assert.ok(mine.every((v) => v.reviewer_session_id === "seed" && v.checks && (v.checks as unknown[]).length === 4));
    assert.equal(row.status, r.decided);
    assert.equal(row.revision, r.reviews.length);
    assert.equal(row.review_id, mine[mine.length - 1].review_id);
    assert.equal(row.recommendation, r.reviews[r.reviews.length - 1].recommendation);
    assert.ok(row.decided_at && row.reviewed_at && row.submitted_at);
    const kinds = events.filter((e) => e.request_id === r.request_id).map((e) => e.kind);
    assert.ok(kinds.length >= 3, r.request_id);
    assert.equal(kinds[0], "submitted");
    assert.equal(kinds[1], "reviewed");
    assert.equal(kinds[kinds.length - 1], r.decided);
  }
  const resubmitted = events.filter((e) => e.request_id === "req_priya_snowflake_account_admin");
  assert.deepEqual(resubmitted.map((e) => e.kind), ["submitted", "reviewed", "returned", "resubmitted", "reviewed", "granted"]);
  assert.equal(resubmitted[2].note, BACKLOG.find((r) => r.request_id === "req_priya_snowflake_account_admin")!.returned_note);
  for (const r of BACKLOG) {
    const mine = events.filter((e) => e.request_id === r.request_id).map((e) => String(e.created_at));
    assert.deepEqual(mine, [...mine].sort(), r.request_id);
  }
  for (const r of REQUESTS) {
    assert.deepEqual(events.filter((e) => e.request_id === r.request_id).map((e) => [e.kind, e.actor]), [["seeded", "system"]]);
  }
});

function fakeSeedStore(present: Record<string, string[]>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      const m = /^store__(\w+)__query$/.exec(name);
      if (!m) return {};
      const field = STORE_KEYS[m[1] as keyof typeof STORE_KEYS];
      return { documents: (present[m[1]] ?? []).map((k) => ({ payload: { [field]: k } })) };
    },
    now: () => new Date(NOW),
  };
  const written = () => calls.filter(([n]) => n.endsWith("__set")).map(([n, a]) => `${/^store__(\w+)__/.exec(n)![1]}:${a.key}`);
  return { ctx, calls, written };
}

test("seeding writes only the rows that are missing, entitlements first, in every store", async () => {
  const present = { entitlements: ["ent_ravi_menon_engineering_github_developer"], requests: ["req_tom_aws_prod_admin", "req_priya_netsuite_ap_clerk"], reviews: [], events: [] };
  const { ctx, written, calls } = fakeSeedStore(present);
  const seeded = await ensureExamplesSeeded(ctx);
  const expected = allRows().flatMap((s) =>
    s.rows.filter((r) => !(present[s.store as keyof typeof present] as string[]).includes(String(r[s.field]))).map((r) => `${s.store}:${r[s.field]}`),
  );
  assert.deepEqual(written(), expected);
  assert.ok(written()[0].startsWith("entitlements:"));
  assert.equal(seeded, rowsOf("requests").length - 2);
  const first = calls.find(([n, a]) => n === "store__requests__set" && a.key === "req_tom_github_developer")![1].value as Record<string, unknown>;
  assert.equal(first.status, "new");
  assert.equal(first.recommendation, null);
  assert.equal(first.review_id, null);
  assert.equal(first.revision, 1);
  assert.deepEqual([first.requester, first.manager, first.system, first.role, first.sensitivity], ["Tom Becker (Engineering)", "Ravi Menon (Engineering)", "GitHub", "Developer", "standard"]);
  assert.equal(first.submitted_at, first.received_at);
  assertDeclared("seed_examples", calls.map(([n]) => n));
});

test("seeding twice writes nothing the second time, and assumeEmpty skips the lookups", async () => {
  const stores = Object.fromEntries(allRows().map((s) => [s.store, s.rows.map((r) => String(r[s.field]))]));
  const { ctx, written } = fakeSeedStore(stores);
  assert.equal(await ensureExamplesSeeded(ctx), 0);
  assert.deepEqual(written(), []);
  const blind = fakeSeedStore(stores);
  assert.equal(await ensureExamplesSeeded(blind.ctx, { assumeEmpty: true }), rowsOf("requests").length);
  assert.ok(!blind.calls.some(([n]) => n.endsWith("__query")));
  assert.equal(blind.written().length, allRows().reduce((n, s) => n + s.rows.length, 0));
});
