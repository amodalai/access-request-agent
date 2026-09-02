import type { CustomToolContext } from "../../_types/tool-context.js";
import { reviewDeps } from "../../_lib/access-review.js";
import { submitRequest } from "../../_lib/submit.js";

/**
 * submit_request: the employee's request, written and reviewed in one
 * durable run (invoked via POST /api/tools/submit_request/run; the `invoke`
 * trigger in tool.json is the opt-in). The invoke lane does not validate a
 * tool.json tool's `parameters` schema, so the flow validates the input
 * itself. In no agent's tools: it runs only from the New request form.
 */
export default async function submit_request(params: Record<string, unknown>, ctx: CustomToolContext) {
  return submitRequest(params, reviewDeps("submit_request", ctx));
}
