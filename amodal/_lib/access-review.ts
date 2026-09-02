import type { CustomToolContext } from "../_types/tool-context.js";
import { conflictsOf, roleLabel, roleOf, type Sensitivity } from "./catalog.js";
import { REQUESTS, ensureExamplesSeeded, requestRow, seedRows } from "./demo-data.js";
import { appendEvent } from "./events.js";
import { accessMath, type AccessMath } from "./policy.js";

export interface RequestRow {
  request_id: string;
  requester: string;
  manager: string;
  role_id: string;
  system: string;
  role: string;
  sensitivity: Sensitivity;
  justification: string;
  ticket?: string | null;
  start_date: string;
  end_date: string;
  notes?: string | null;
  revision?: number;
  status?: string;
  recommendation?: Recommendation | null;
  review_id?: string | null;
  returned_note?: string | null;
  received_at: string;
  submitted_at?: string;
  [k: string]: unknown;
}

export interface EntitlementRow {
  entitlement_id: string;
  person: string;
  role_id: string;
  system: string;
  role: string;
  sensitivity: Sensitivity;
  granted_at: string;
  expires_at: string;
  source_request_id: string | null;
  status: "active" | "expired";
  [k: string]: unknown;
}

export type Recommendation = "grant" | "limit" | "escalate" | "deny";
const RANK: Record<Recommendation, number> = { grant: 0, limit: 1, escalate: 2, deny: 3 };

/** A request the approver has not decided yet. */
export const OPEN_STATUSES = ["new", "reviewed", "returned"] as const;

export interface Check {
  name: string;
  status: "pass" | "flag" | "fail";
  note: string;
}

export interface ReviewResult {
  recommendation: string;
  summary: string;
  checks: Check[];
  issues: string[];
}

/** What code decides before the reviewer sees the request. */
export interface Facts {
  role_found: boolean;
  sensitivity: Sensitivity;
  /** Labels of the active roles the requester holds. */
  held: string[];
  /** The held roles the requested one may not be combined with. */
  conflicts_with: string[];
  already_held: boolean;
  /** The earlier open request this one duplicates, or null. */
  duplicate_of: string | null;
  math: AccessMath;
}

export const REVIEWER_SUBAGENT = "access-reviewer";

/** One row per run: a re-review or a resubmission keeps the earlier reviews. */
export function reviewKey(request_id: string, revision: number, createdAt: Date): string {
  return `rev_${request_id}_${revision}_${createdAt.getTime()}`;
}

const isOpen = (r: RequestRow) => (OPEN_STATUSES as readonly string[]).includes(String(r.status));

/**
 * The earliest other open request from the same person for the same role.
 * Arrival order decides which is the original: the later one is the
 * duplicate, so an original is never flagged because of its own resend.
 */
export function findDuplicate(request: RequestRow, others: RequestRow[]): RequestRow | undefined {
  return others
    .filter(
      (o) =>
        o.request_id !== request.request_id &&
        o.requester === request.requester &&
        o.role_id === request.role_id &&
        isOpen(o) &&
        (o.received_at < request.received_at ||
          (o.received_at === request.received_at && o.request_id < request.request_id)),
    )
    .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
}

export function checkRequest(request: RequestRow, held: EntitlementRow[], others: RequestRow[]): Facts {
  const role = roleOf(request.role_id);
  const active = held.filter((e) => e.person === request.requester && e.status === "active");
  const conflicts = conflictsOf(request.role_id);
  const sensitivity = role?.sensitivity ?? request.sensitivity ?? "standard";
  return {
    role_found: !!role,
    sensitivity,
    held: active.map(roleLabel),
    conflicts_with: active.filter((e) => conflicts.includes(e.role_id)).map(roleLabel),
    already_held: active.some((e) => e.role_id === request.role_id),
    duplicate_of: findDuplicate(request, others)?.request_id ?? null,
    math: accessMath({ start_date: request.start_date, end_date: request.end_date, sensitivity }),
  };
}

/**
 * The hard rules that stop a grant outright, whatever the reviewer or the
 * operator says. Each string is the reason shown to a human.
 */
export function grantBlockers(f: Facts, request: Pick<RequestRow, "role_id" | "system" | "role">): string[] {
  const out: string[] = [];
  const label = roleLabel(request);
  if (!f.role_found) out.push(`unknown role ${request.role_id}`);
  if (f.duplicate_of) out.push(`duplicate of open request ${f.duplicate_of}`);
  if (f.conflicts_with.length > 0)
    out.push(`conflicts with ${f.conflicts_with.join(" and ")}, which the requester already holds (segregation of duties)`);
  if (f.already_held) out.push(`the requester already holds ${label}`);
  if (!f.math.valid_dates) out.push("the end date is not after the start date");
  else if (!f.math.within_limit)
    out.push(`${f.math.requested_days} days requested, over the ${f.math.max_days}-day limit for ${f.sensitivity} roles`);
  return out;
}

/** The least conservative recommendation the facts allow. */
export function floorRecommendation(f: Facts): Recommendation {
  if (!f.role_found || f.duplicate_of || f.conflicts_with.length > 0 || f.already_held) return "deny";
  if (f.sensitivity === "privileged") return "escalate";
  if (!f.math.within_limit) return "limit";
  return "grant";
}

/** The reviewer's call, or the floor, whichever is more conservative. */
export function clampRecommendation(proposed: string, f: Facts): Recommendation {
  const floor = floorRecommendation(f);
  // hasOwn, not `in`: `proposed` comes from the model, and "toString" is on the prototype.
  const rec = Object.hasOwn(RANK, proposed) ? (proposed as Recommendation) : "limit";
  return RANK[rec] >= RANK[floor] ? rec : floor;
}

export function rows<T>(q: unknown): T[] {
  const docs = (q as { documents?: Array<{ payload: T }> }).documents;
  return (docs ?? []).map((d) => d.payload);
}

/**
 * Unwrap a `store__*__get` result. The runtime returns `{error: "... not
 * found ..."}` for a missing key, not undefined, so every get goes through
 * here.
 */
export function storeGetResult<T>(doc: unknown): T | undefined {
  if (!doc || typeof doc !== "object" || "error" in doc) return undefined;
  return doc as T;
}

/**
 * Parse the reviewer subagent's final text into a ReviewResult. The
 * AGENT.md contract is "reply with only the JSON object", but stay
 * defensive: strip code fences and any stray prose around the object.
 */
export function parseReviewResult(text: string): ReviewResult {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`${REVIEWER_SUBAGENT} returned no JSON object: ${text.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (err) {
    throw new Error(
      `${REVIEWER_SUBAGENT} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const r = parsed as Partial<ReviewResult>;
  if (typeof r.recommendation !== "string") {
    throw new Error(`${REVIEWER_SUBAGENT} JSON is missing a string \`recommendation\``);
  }
  return {
    recommendation: r.recommendation,
    summary: typeof r.summary === "string" ? r.summary : "",
    checks: Array.isArray(r.checks) ? r.checks : [],
    issues: Array.isArray(r.issues) ? r.issues : [],
  };
}

export interface ReviewDeps {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  /** Run a declared subagent to completion and return its final text. */
  callSubagent(ref: string, task: string, input?: unknown): Promise<string>;
  /** Full text of the access policy. Subagents see only their own AGENT.md,
   *  so the caller loads the policy and passes it in as input. */
  loadPolicy(): Promise<string>;
  now(): Date;
  random?(): number;
  sessionId: string;
  /** Optional reasoning-trace sink (ctx.emitReasoning). */
  trace?(line: string): void;
}

/** Single source of truth for the policy text the reviewer reads, repo-relative. */
export const POLICY_PATH = "amodal/knowledge/access-policy.md";

/**
 * The review flow's dependencies from a composite tool's context. Everything
 * the flow calls must be declared in the tool's `uses`; undeclared calls fail
 * closed. `now` and `random` are journaled in a durable run.
 */
export function reviewDeps(tool: string, ctx: CustomToolContext): ReviewDeps {
  if (!ctx.callTool || !ctx.callSubagent) {
    throw new Error(
      `${tool} needs the composite context (ctx.callTool + ctx.callSubagent). ` +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  return {
    callTool: (name, args) => ctx.callTool!(name, args),
    callSubagent: (ref, task, input) => ctx.callSubagent!(ref, task, input),
    loadPolicy: () => {
      if (!ctx.fs) throw new Error(`ctx.fs is unavailable, so the access policy (${POLICY_PATH}) cannot be read.`);
      return ctx.fs.readRepoFile(POLICY_PATH);
    },
    now: () => new Date(ctx.now ? ctx.now() : Date.now()),
    random: () => (ctx.random ?? Math.random)(),
    sessionId: ctx.sessionId ?? "",
    trace: (line) => ctx.emitReasoning?.(line),
  };
}

export interface ReviewOutcome {
  found: boolean;
  request_id: string;
  requester?: string;
  role?: string;
  recommendation?: Recommendation;
  summary?: string;
  checks?: Check[];
  issues?: string[];
  review_id?: string;
}

export interface LoadedRequest {
  request: RequestRow;
  /** The requester's entitlements, active and expired. */
  held: EntitlementRow[];
  /** The requester's other requests. */
  others: RequestRow[];
}

/** Load a request with the requester's entitlements and other requests. */
export async function loadRequest(
  request_id: string,
  deps: Pick<ReviewDeps, "callTool">,
): Promise<LoadedRequest | undefined> {
  const request = storeGetResult<RequestRow>(await deps.callTool("store__requests__get", { key: request_id }));
  if (!request) return undefined;
  const held = rows<EntitlementRow>(
    await deps.callTool("store__entitlements__query", { where: { person: request.requester }, limit: 200 }),
  );
  const others = rows<RequestRow>(
    await deps.callTool("store__requests__query", { where: { requester: request.requester }, limit: 200 }),
  );
  return { request, held, others };
}

/**
 * The review's load. On fresh stores the demo request is taken from the
 * dataset and the stores are seeded for later runs: a run cannot read back
 * its own uncommitted writes, so the rows just written are not visible in
 * this run. review_request's `uses` therefore declares the seed's tools.
 */
async function loadOrSeedExample(
  request_id: string,
  deps: Pick<ReviewDeps, "callTool" | "now" | "trace">,
): Promise<LoadedRequest | undefined> {
  const loaded = await loadRequest(request_id, deps);
  if (loaded) return loaded;

  const example = REQUESTS.find((r) => r.request_id === request_id);
  if (!example) return undefined;
  deps.trace?.(`\`${request_id}\` not in the store; seeding the demo dataset and reviewing the in-memory example.`);
  await ensureExamplesSeeded(deps);
  const nowIso = deps.now().toISOString();
  const seed = seedRows(nowIso);
  return {
    request: requestRow(example, nowIso),
    held: (seed.entitlements as EntitlementRow[]).filter((e) => e.person === example.requester),
    others: (seed.requests as RequestRow[]).filter((r) => r.requester === example.requester),
  };
}

/**
 * Review one request revision. `preloaded` is for a caller that already
 * holds the rows (submit_request reviews the row it just wrote, which a run
 * cannot read back); otherwise the rows come from the stores.
 */
export async function runRequestReview(
  request_id: string,
  deps: ReviewDeps,
  preloaded?: LoadedRequest,
): Promise<ReviewOutcome> {
  const loaded = preloaded ?? (await loadOrSeedExample(request_id, deps));
  if (!loaded) return { found: false, request_id };
  const { request, held, others } = loaded;
  const label = roleLabel(request);

  const facts = checkRequest(request, held, others);
  deps.trace?.(
    `Loaded ${request.requester}'s request for ${label} (${facts.sensitivity}), ${request.start_date} to ${request.end_date}: ` +
      `${facts.held.length} active role(s) held, ${others.filter((o) => o.request_id !== request_id).length} other request(s) on file.`,
  );

  const blockers = grantBlockers(facts, request);
  deps.trace?.(
    blockers.length > 0
      ? `Deterministic checks: ${blockers.join("; ")}.`
      : "Deterministic checks: role, segregation of duties, duplicate lookup, and duration all pass.",
  );

  deps.trace?.(`Delegating the policy judgment to the ${REVIEWER_SUBAGENT} subagent.`);
  const role = roleOf(request.role_id);
  const reviewText = await deps.callSubagent(
    REVIEWER_SUBAGENT,
    [
      "Review this access request against the access policy (included in the context as `access_policy`).",
      "Emit one check per category, an issues list, and a single recommendation.",
      "The segregation-of-duties lookup, the duplicate lookup, and the existing-access lookup have already been done in code and are given to you as `facts`. Treat them as fact and do not re-derive them.",
      "Call `access_math` for the duration before assessing it.",
      "Do not grant, deny, or provision anything yourself: you recommend.",
    ].join(" "),
    {
      access_policy: await deps.loadPolicy(),
      request: {
        requester: request.requester,
        manager: request.manager,
        system: request.system,
        role: request.role,
        role_id: request.role_id,
        justification: request.justification,
        ticket: request.ticket ?? null,
        start_date: request.start_date,
        end_date: request.end_date,
        notes: request.notes ?? null,
      },
      role: role ? { role_id: role.role_id, system: role.system, role: role.role, sensitivity: role.sensitivity, purpose: role.purpose } : null,
      existing_access: held
        .filter((e) => e.status === "active")
        .map((e) => ({ system: e.system, role: e.role, sensitivity: e.sensitivity, expires_at: e.expires_at })),
      facts: {
        role_found: facts.role_found,
        sensitivity: facts.sensitivity,
        conflicts_with: facts.conflicts_with,
        already_held: facts.already_held,
        duplicate_of: facts.duplicate_of,
      },
    },
  );

  const review = parseReviewResult(reviewText);
  const recommendation = clampRecommendation(review.recommendation, facts);
  if (recommendation !== review.recommendation) {
    deps.trace?.(`Code clamped the recommendation from \`${review.recommendation}\` to \`${recommendation}\`.`);
  }
  const issues = Array.from(new Set([...blockers, ...review.issues]));

  const now = deps.now();
  const nowIso = now.toISOString();
  const revision = request.revision ?? 1;
  const review_id = reviewKey(request_id, revision, now);
  await deps.callTool("store__reviews__set", {
    key: review_id,
    value: {
      review_id,
      request_id,
      revision,
      recommendation,
      summary: review.summary,
      checks: review.checks,
      issues,
      reviewer_session_id: deps.sessionId,
      created_at: nowIso,
    },
  });
  await deps.callTool("store__requests__set", {
    key: request_id,
    value: { ...request, status: "reviewed", recommendation, review_id, reviewed_at: nowIso },
  });
  await appendEvent(deps, { request_id, kind: "reviewed", actor: "agent", recommendation, revision });
  deps.trace?.(`Saved \`${review_id}\` (${recommendation}) and stamped the request.`);

  return {
    found: true,
    request_id,
    requester: request.requester,
    role: label,
    recommendation,
    summary: review.summary,
    checks: review.checks,
    issues,
    review_id,
  };
}
