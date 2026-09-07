import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResolvedToolRun } from "@amodalai/react";
import { runTool } from "./tools.js";

test("returns the result of a completed tool run", async () => {
  const result = { request_id: "req_1" };
  const launcher = { run: async () => ({ sessionId: "test", outcome: { sessionId: "test", kind: "complete" }, result } as ResolvedToolRun) };
  assert.deepEqual(await runTool(launcher, {}), result);
});

test("rejects every incomplete tool outcome and preserves the useful error", async () => {
  for (const kind of ["failed", "cancelled", "paused", "review-pending"]) {
    const launcher = { run: async () => ({ sessionId: "test", outcome: { sessionId: "test", kind, reason: 'Tool "review_request" failed: Review interrupted.' } } as ResolvedToolRun) };
    await assert.rejects(runTool(launcher, {}), { message: "Review interrupted." });
  }
});
