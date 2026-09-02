import type { Check, Recommendation } from "../amodal/_lib/access-review.js";
import { roleLabel, type Sensitivity } from "../amodal/_lib/catalog.js";
import type { EventRow } from "../amodal/_lib/events.js";
import { daysBetween } from "../amodal/_lib/policy.js";

export type { Check, EventRow, Recommendation, Sensitivity };
export { roleLabel };

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
  revision: number;
  status: "new" | "reviewed" | "granted" | "denied" | "returned";
  recommendation?: Recommendation | null;
  review_id?: string | null;
  reviewed_at?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  returned_note?: string | null;
  received_at: string;
  submitted_at: string;
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
}

export interface ReviewRow {
  review_id: string;
  request_id: string;
  revision: number;
  recommendation: Recommendation;
  summary: string;
  checks?: Check[];
  issues: string[];
  created_at: string;
}

export type Decision = "granted" | "denied" | "returned";

/** Every store, loaded once at the top and passed to the screens. */
export interface Data {
  requests: RequestRow[];
  entitlements: EntitlementRow[];
  /** Per request, newest first. */
  reviews: Map<string, ReviewRow[]>;
  /** Newest first. */
  events: EventRow[];
  refetch(): Promise<void>;
}

export const REC_LABEL: Record<Recommendation, string> = {
  grant: "Grant",
  limit: "Limit",
  escalate: "Escalate",
  deny: "Deny",
};

/** What a requester sees in place of the recommendation. */
export const STATUS_LABEL: Record<RequestRow["status"], string> = {
  new: "Under review",
  reviewed: "Under review",
  returned: "Returned, action needed",
  granted: "Granted",
  denied: "Denied",
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The number of days a request or an entitlement covers. */
export const windowDays = (r: Pick<RequestRow, "start_date" | "end_date">) => daysBetween(r.start_date, r.end_date);

export const isDecided = (r: RequestRow) => r.status === "granted" || r.status === "denied";

/** The review the request names, else the newest one. */
export const latestReview = (data: Data, r: RequestRow) => {
  const mine = data.reviews.get(r.request_id) ?? [];
  return mine.find((v) => v.review_id === r.review_id) ?? mine[0];
};

/** A person's active roles. */
export const activeAccess = (data: Data, person: string) =>
  data.entitlements.filter((e) => e.person === person && e.status === "active").sort((a, b) => roleLabel(a).localeCompare(roleLabel(b)));
