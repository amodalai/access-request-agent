import { PEOPLE, entitlementKey, roleOf } from "./catalog.js";
import { BACKLOG, BASELINE_ENTITLEMENTS, REQUESTS, type ExampleRequest } from "./examples.js";
import { eventRow, type EventInput } from "./events.js";
import { reviewKey } from "./access-review.js";
import { dayIso } from "./policy.js";

export { REQUESTS };

interface SeedCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
}

/** The demo's clock: requests "arrived" over the days before this date, and an entitlement past it is expired. */
export const DEMO_NOW = "2026-09-01T09:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const NEW_REQUEST_DEFAULTS = {
  status: "new" as const,
  recommendation: null,
  review_id: null,
  reviewed_at: null,
  decided_at: null,
  decision_note: null,
  returned_note: null,
};

export interface EntitlementSeed {
  person: string;
  role_id: string;
  granted_at: string;
  expires_at: string;
  source_request_id: string | null;
}

export function entitlementRow(e: EntitlementSeed, nowIso: string) {
  const role = roleOf(e.role_id)!;
  return {
    entitlement_id: entitlementKey(e.person, e.role_id),
    person: e.person,
    role_id: e.role_id,
    system: role.system,
    role: role.role,
    sensitivity: role.sensitivity,
    granted_at: e.granted_at,
    expires_at: e.expires_at,
    source_request_id: e.source_request_id,
    status: e.expires_at > DEMO_NOW ? ("active" as const) : ("expired" as const),
    created_at: nowIso,
  };
}

export function requestRow(r: ExampleRequest, nowIso: string) {
  const role = roleOf(r.role_id)!;
  const received = new Date(DEMO_NOW);
  received.setUTCDate(received.getUTCDate() - 7 + r.received_offset_days);
  return {
    request_id: r.request_id,
    requester: r.requester,
    manager: PEOPLE[r.requester].manager,
    role_id: r.role_id,
    system: role.system,
    role: role.role,
    sensitivity: role.sensitivity,
    justification: r.justification,
    ticket: r.ticket ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
    notes: r.notes ?? null,
    revision: 1,
    ...NEW_REQUEST_DEFAULTS,
    received_at: received.toISOString(),
    submitted_at: received.toISOString(),
    created_at: nowIso,
  };
}

/**
 * The backlog in its final state: each request with one review per revision,
 * its events (submitted, reviewed, then returned and resubmitted for every
 * revision but the last, then the decision), timed from `received_at`, and
 * the entitlement a grant created.
 */
function backlogRows(nowIso: string) {
  const requests: Array<Record<string, unknown>> = [];
  const entitlements: Array<Record<string, unknown>> = [];
  const reviews: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  for (const req of BACKLOG) {
    const base = requestRow(req, nowIso);
    const received = Date.parse(base.received_at);
    const event = (e: EventInput, at: Date) =>
      events.push({ ...eventRow({ request_id: req.request_id, ...e }, at, `${req.request_id}_${events.length}`) });
    const last = req.reviews.length - 1;
    let latest = { review_id: "", reviewed_at: "", submitted_at: "", decided_at: "" };
    req.reviews.forEach((r, i) => {
      const revision = i + 1;
      const submitted = new Date(received + i * 3 * DAY);
      const reviewed = new Date(submitted.getTime() + HOUR);
      const decided = new Date(submitted.getTime() + DAY);
      const review_id = reviewKey(req.request_id, revision, reviewed);
      event({ kind: i === 0 ? "submitted" : "resubmitted", actor: req.requester, revision }, submitted);
      reviews.push({ review_id, request_id: req.request_id, revision, ...r, reviewer_session_id: "seed", created_at: reviewed.toISOString() });
      event({ kind: "reviewed", actor: "agent", recommendation: r.recommendation, revision }, reviewed);
      event(
        i === last
          ? { kind: req.decided, actor: "approver", note: req.decision_note, revision }
          : { kind: "returned", actor: "approver", note: req.returned_note, revision },
        decided,
      );
      latest = {
        review_id,
        reviewed_at: reviewed.toISOString(),
        submitted_at: submitted.toISOString(),
        decided_at: decided.toISOString(),
      };
    });
    requests.push({
      ...base,
      ...latest,
      revision: req.reviews.length,
      status: req.decided,
      recommendation: req.reviews[last].recommendation,
      decision_note: req.decision_note ?? null,
    });
    if (req.decided === "granted") {
      entitlements.push(
        entitlementRow(
          { person: req.requester, role_id: req.role_id, granted_at: latest.decided_at, expires_at: dayIso(req.end_date), source_request_id: req.request_id },
          nowIso,
        ),
      );
    }
  }
  return { requests, entitlements, reviews, events };
}

/** The seeded stores and the field each one is keyed by. Entitlements first: the guard hook reads them when a granted request is written. */
export const STORE_KEYS = {
  entitlements: "entitlement_id",
  requests: "request_id",
  reviews: "review_id",
  events: "event_id",
} as const;

/** Every row the seed writes, per store. */
export function seedRows(nowIso: string): Record<keyof typeof STORE_KEYS, Array<Record<string, unknown>>> {
  const backlog = backlogRows(nowIso);
  const live = REQUESTS.map((r) => requestRow(r, nowIso));
  return {
    entitlements: [
      ...BASELINE_ENTITLEMENTS.map((e) =>
        entitlementRow({ person: e.person, role_id: e.role_id, granted_at: dayIso(e.granted_at), expires_at: dayIso(e.expires_at), source_request_id: null }, nowIso),
      ),
      ...backlog.entitlements,
    ],
    requests: [...backlog.requests, ...live],
    reviews: backlog.reviews,
    events: [
      ...backlog.events,
      ...live.map((r) => ({
        ...eventRow({ request_id: r.request_id, kind: "seeded", actor: "system", revision: 1 }, new Date(r.received_at), `${r.request_id}_0`),
      })),
    ],
  };
}

/**
 * Write every demo entitlement, request, review, and event that is not
 * already in the stores. Idempotent per row, so `seed` is safe to resend.
 * `assumeEmpty` skips the lookups: reset_demo removes every row first and
 * cannot read back its own removes. Returns how many requests were written.
 */
export async function ensureExamplesSeeded(ctx: SeedCtx, opts: { assumeEmpty?: boolean } = {}): Promise<number> {
  const nowIso = (ctx.now ? ctx.now() : new Date()).toISOString();
  const all = seedRows(nowIso);
  let seeded = 0;
  for (const [store, field] of Object.entries(STORE_KEYS)) {
    const rows = all[store as keyof typeof STORE_KEYS];
    const present = new Set<unknown>();
    if (!opts.assumeEmpty) {
      const q = (await ctx.callTool(`store__${store}__query`, { limit: 1000 })) as {
        documents?: Array<{ payload: Record<string, unknown> }>;
      };
      for (const d of q.documents ?? []) present.add(d.payload[field]);
    }
    for (const row of rows) {
      if (present.has(row[field])) continue;
      if (store === "requests") seeded += 1;
      await ctx.callTool(`store__${store}__set`, { key: row[field], value: row });
    }
  }
  return seeded;
}
