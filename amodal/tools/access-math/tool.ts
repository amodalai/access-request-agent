/**
 * access_math: deterministic arithmetic over one access request. The number
 * of days requested, the policy limit for the role's sensitivity, and whether
 * the window is within it come from code, never from the model. Returns
 * numbers, never verdicts: whether a justification fits the role stays with
 * the access-reviewer subagent. A pure function of its input, hence
 * `exposure: open`. The review_request tool calls the same `accessMath` from
 * code to enforce the hard rules.
 */
import type { ToolDefinition } from "../../_types/tool-context.js";
import { accessMath, type AccessMath, type AccessMathInput } from "../../_lib/policy.js";

const tool: ToolDefinition<AccessMathInput, AccessMath> = {
  id: "access_math",
  exposure: { kind: "open" },
  llm_callable: true,
  base: {
    name: "access_math",
    description:
      "Deterministic arithmetic over one access request: the number of days " +
      "between the start and end dates, the policy's maximum for the role's " +
      "sensitivity (30 days privileged, 365 days standard), whether the request is " +
      "within it, and by how many days it is over. Call it once with the request's " +
      "dates and the role's sensitivity before assessing the duration, and treat " +
      "the numbers as fact. Do not count days yourself. It returns numbers only: " +
      "judging whether the justification fits the role stays with you.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "The first day of access, YYYY-MM-DD, exactly as given in your context." },
        end_date: { type: "string", description: "The last day of access, YYYY-MM-DD." },
        sensitivity: {
          type: "string",
          enum: ["standard", "privileged"],
          description: "The role's sensitivity from the catalog, as given in your context.",
        },
      },
      required: ["start_date", "end_date", "sensitivity"],
    },
  },

  async handle(ctx) {
    return accessMath(ctx.input);
  },
};

export default tool;
