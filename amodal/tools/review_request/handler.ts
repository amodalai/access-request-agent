import type { CustomToolContext } from "../../_types/tool-context.js";
import { reviewDeps, runRequestReview } from "../../_lib/access-review.js";

export interface ReviewRequestParams {
  request_id?: string;
}

/**
 * Durable tool behind both review entry points: the `review <id>` chat
 * command (a regex trigger on this tool, fired from the request path before
 * the LLM) and the UI's Review button (POST /api/tools/review_request/run;
 * the `invoke` trigger in tool.json is the opt-in). The deterministic work
 * (store I/O, the matching rules, the clamp on the way out) stays in code;
 * the policy judgment runs in the access-reviewer subagent via
 * ctx.callSubagent. Everything this handler calls is declared in tool.json
 * `uses`; undeclared calls fail closed.
 */
export default async function review_request(params: ReviewRequestParams, ctx: CustomToolContext) {
  const request_id = params.request_id?.trim();
  if (!request_id) throw new Error("review_request requires a request_id.");
  return runRequestReview(request_id, reviewDeps("review_request", ctx));
}
