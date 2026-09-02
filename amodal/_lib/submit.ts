import { PEOPLE, roleOf, slug } from "./catalog.js";
import { NEW_REQUEST_DEFAULTS } from "./demo-data.js";
import { appendEvent } from "./events.js";
import { rows, runRequestReview, storeGetResult, type EntitlementRow, type RequestRow, type ReviewDeps } from "./access-review.js";

export interface SubmitParams {
  /** Present on a resubmission of a returned request. */
  request_id?: string;
  role_id: string;
  start_date: string;
  end_date: string;
  justification: string;
  ticket: string | null;
  notes: string | null;
  requester: string;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isoDate = (s: string) => {
  const t = Date.parse(s);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/**
 * Check a submission and throw one error naming every problem. The duration
 * is not capped here: the policy's limit has to be demonstrable.
 */
export function validateSubmission(input: unknown): SubmitParams {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const required = (field: string) => {
    const v = text(p[field]);
    if (!v) problems.push(`${field} is required`);
    return v;
  };
  const date = (field: string) => {
    const v = required(field);
    if (v && !isoDate(v)) problems.push(`${field} must be a date as YYYY-MM-DD`);
    return v;
  };
  const role_id = required("role_id");
  if (role_id && !roleOf(role_id)) problems.push(`role_id ${role_id} is not in the catalog`);
  const requester = required("requester");
  if (requester && !PEOPLE[requester]) problems.push(`requester ${requester} is not a known employee`);
  const start_date = date("start_date");
  const end_date = date("end_date");
  if (start_date && end_date && isoDate(start_date) && isoDate(end_date) && end_date <= start_date) {
    problems.push("end_date must be after start_date");
  }
  const justification = required("justification");
  if (problems.length > 0) throw new Error(`${problems.join("; ")}.`);
  const request_id = text(p.request_id);
  return {
    ...(request_id ? { request_id } : {}),
    role_id,
    start_date,
    end_date,
    justification,
    ticket: text(p.ticket) || null,
    notes: text(p.notes) || null,
    requester,
  };
}

/**
 * Write the request (a new row, or the returned one at revision + 1), append
 * the event, then review the row held in memory: a run cannot read back its
 * own writes. A review failure leaves the request `new` for the approver's
 * Review button to retry.
 */
export async function submitRequest(input: unknown, deps: ReviewDeps) {
  const { request_id: id, ...fields } = validateSubmission(input);
  const role = roleOf(fields.role_id)!;
  const denormalized = { ...fields, system: role.system, role: role.role, sensitivity: role.sensitivity, manager: PEOPLE[fields.requester].manager };
  const nowIso = deps.now().toISOString();
  const others = rows<RequestRow>(
    await deps.callTool("store__requests__query", { where: { requester: fields.requester }, limit: 200 }),
  );

  let request: RequestRow;
  if (id) {
    const existing = storeGetResult<RequestRow>(await deps.callTool("store__requests__get", { key: id }));
    if (!existing) throw new Error(`Request ${id} not found.`);
    if (existing.status !== "returned") {
      throw new Error(`Request ${id} is ${existing.status}; only a returned request can be resubmitted.`);
    }
    request = { ...existing, ...denormalized, ...NEW_REQUEST_DEFAULTS, revision: (existing.revision ?? 1) + 1, submitted_at: nowIso };
  } else {
    const base = `req_${slug(fields.requester)}_${slug(fields.role_id)}`;
    const taken = async (key: string) => !!storeGetResult<RequestRow>(await deps.callTool("store__requests__get", { key }));
    let request_id = base;
    for (let n = 2; await taken(request_id); n += 1) request_id = `${base}_${n}`;
    request = { request_id, ...denormalized, revision: 1, ...NEW_REQUEST_DEFAULTS, received_at: nowIso, submitted_at: nowIso, created_at: nowIso };
  }
  const revision = request.revision!;
  await deps.callTool("store__requests__set", { key: request.request_id, value: request });
  await appendEvent(deps, { request_id: request.request_id, kind: id ? "resubmitted" : "submitted", actor: fields.requester, revision });

  const held = rows<EntitlementRow>(
    await deps.callTool("store__entitlements__query", { where: { person: fields.requester }, limit: 200 }),
  );
  const out = await runRequestReview(request.request_id, deps, { request, held, others });
  return { request_id: request.request_id, revision, recommendation: out.recommendation, review_id: out.review_id };
}
