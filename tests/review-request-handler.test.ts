import { test } from "node:test";
import assert from "node:assert/strict";
import review_request from "../amodal/tools/review_request/handler.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";
import { assertDeclared, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const REPLY = JSON.stringify({ recommendation: "grant", summary: "Fine.", checks: [], issues: [] });

function fakeCtx(opts: { fresh?: boolean } = {}) {
  const { store, calls, callTool } = fakeStore(opts.fresh ? undefined : NOW);
  const seen = { policyPath: "", input: undefined as unknown, reasoning: [] as string[] };
  const ctx: CustomToolContext = {
    log() {},
    signal: new AbortController().signal,
    sessionId: "sess-1",
    now: () => Date.parse(NOW),
    emitReasoning: (t) => seen.reasoning.push(t),
    fs: {
      async readRepoFile(p) {
        seen.policyPath = p;
        return "# policy";
      },
    },
    callTool,
    async callSubagent(_ref, _task, input) {
      seen.input = input;
      return REPLY;
    },
  };
  return { ctx, store, seen, calls };
}

test("wires the composite context into the review flow", async () => {
  const { ctx, store, seen, calls } = fakeCtx();
  const out = await review_request({ request_id: " req_tom_github_developer " }, ctx);
  assert.equal(out.found, true);
  assert.equal(out.recommendation, "grant");
  assert.equal(seen.policyPath, "amodal/knowledge/access-policy.md");
  assert.equal((seen.input as { access_policy: string }).access_policy, "# policy");
  assert.equal(store.get(`reviews:${out.review_id}`)!.reviewer_session_id, "sess-1");
  assert.equal(store.get(`reviews:${out.review_id}`)!.created_at, NOW);
  assert.ok(seen.reasoning.some((l) => l.startsWith("Loaded Tom Becker")));
  assertDeclared("review_request", calls.map(([n]) => n));
});

test("on fresh stores it seeds the dataset with tools its uses declares", async () => {
  const { ctx, store, calls } = fakeCtx({ fresh: true });
  const out = await review_request({ request_id: "req_sofia_workday_hr_read" }, ctx);
  assert.equal(out.found, true);
  assert.ok(store.has("requests:req_priya_netsuite_ap_clerk") && store.has("entitlements:ent_ravi_menon_engineering_aws_change_approver"));
  assertDeclared("review_request", calls.map(([n]) => n));
});

test("refuses a missing id and a context without composition", async () => {
  const { ctx } = fakeCtx();
  await assert.rejects(review_request({}, ctx), /requires a request_id/);
  await assert.rejects(review_request({ request_id: "req_x" }, { ...ctx, callSubagent: undefined }), /composite context/);
  await assert.rejects(review_request({ request_id: "req_tom_github_developer" }, { ...ctx, fs: undefined }), /access policy .* cannot be read/);
});
