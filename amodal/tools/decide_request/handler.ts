import type { CustomToolContext } from "../../_types/tool-context.js";
import { entitlementKey } from "../../_lib/catalog.js";
import { appendEvent } from "../../_lib/events.js";
import { dayIso } from "../../_lib/policy.js";
import { checkRequest, grantBlockers, loadRequest, storeGetResult } from "../../_lib/access-review.js";

/**
 * decide_request: the system owner's decision, recorded.
 *
 * The approver clicks Grant, Return, or Deny on a reviewed request and
 * confirms in a modal. This durable tool (invoked via POST
 * /api/tools/decide_request/run; the `invoke` trigger in tool.json is the
 * opt-in) requires a reviewed request and its saved review, re-runs the hard
 * rules in code before a grant, writes the decision on the request, writes
 * the entitlement a grant creates, and appends the event.
 *
 * It is in no agent's tools, so it runs only from the UI action: the agent
 * recommends, a human decides. The `access-guard` hook backstops the same
 * rules for every other writer.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema,
 * so this handler is defensive about its input.
 */

export interface DecideRequestParams {
  request_id?: string;
  decision?: string;
  note?: string;
}

const DECISIONS = ["granted", "denied", "returned"] as const;
type Decision = (typeof DECISIONS)[number];

export default async function decide_request(params: DecideRequestParams, ctx: CustomToolContext) {
  const request_id = typeof params.request_id === "string" ? params.request_id.trim() : "";
  const decision = params.decision as Decision;
  const note = typeof params.note === "string" && params.note.trim() ? params.note.trim() : null;
  if (!request_id) throw new Error("No request_id provided.");
  if (!DECISIONS.includes(decision)) {
    throw new Error(`decision must be "granted", "denied", or "returned", got ${JSON.stringify(decision)}.`);
  }
  if (!ctx.callTool) {
    throw new Error(
      "decide_request needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  const callTool = (name: string, args: Record<string, unknown>) => ctx.callTool!(name, args);
  const now = () => new Date(ctx.now ? ctx.now() : Date.now());

  const loaded = await loadRequest(request_id, { callTool });
  if (!loaded) throw new Error(`Request ${request_id} not found.`);
  const { request, held, others } = loaded;
  if (request.status !== "reviewed") {
    throw new Error(`Request ${request_id} is ${request.status}; only a reviewed request can be decided.`);
  }
  const review = request.review_id
    ? storeGetResult<{ recommendation?: string }>(await callTool("store__reviews__get", { key: request.review_id }))
    : undefined;
  if (!review) throw new Error(`No review for ${request_id}. Review it before deciding.`);

  if (decision === "returned" && !note) throw new Error(`Returning ${request_id} needs a note for the requester.`);
  if (decision === "granted") {
    const blockers = grantBlockers(checkRequest(request, held, others), request);
    if (blockers.length > 0) {
      throw new Error(`Cannot grant ${request_id}: ${blockers.join("; ")}.`);
    }
    if (review.recommendation === "escalate" && !note) {
      throw new Error(`Granting ${request_id} against an escalate recommendation needs a note.`);
    }
  }

  const nowIso = now().toISOString();
  const expires_at = dayIso(request.end_date);
  // store__set replaces the whole value, so re-emit the full row.
  await callTool("store__requests__set", {
    key: request_id,
    value:
      decision === "returned"
        ? { ...request, status: decision, returned_note: note, decided_at: null }
        : { ...request, status: decision, decided_at: nowIso, decision_note: note },
  });
  if (decision === "granted") {
    await callTool("store__entitlements__set", {
      key: entitlementKey(request.requester, request.role_id),
      value: {
        entitlement_id: entitlementKey(request.requester, request.role_id),
        person: request.requester,
        role_id: request.role_id,
        system: request.system,
        role: request.role,
        sensitivity: request.sensitivity,
        granted_at: nowIso,
        expires_at,
        source_request_id: request_id,
        status: "active",
        created_at: nowIso,
      },
    });
  }
  await appendEvent(
    { callTool, now, random: () => (ctx.random ?? Math.random)() },
    { request_id, kind: decision, actor: "approver", note, revision: request.revision ?? 1 },
  );

  return { request_id, decision, role_id: request.role_id, expires_at: decision === "granted" ? expires_at : null };
}
