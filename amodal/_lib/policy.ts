import type { Sensitivity } from "./catalog.js";

/**
 * The access policy's numbers and arithmetic, in one place. The limits
 * mirror amodal/knowledge/access-policy.md (the text the reviewer subagent
 * reads) and hooks/access-guard/hook.json (the platform-level backstop):
 * change one, change all three.
 */
export const POLICY = {
  /** A privileged role is granted for at most this many days at a time. */
  privileged_max_days: 30,
  /** A standard role is granted for at most this many days at a time. */
  standard_max_days: 365,
} as const;

export interface AccessMathInput {
  start_date: string;
  end_date: string;
  sensitivity: Sensitivity;
}

export interface AccessMath {
  requested_days: number;
  /** The end date is after the start date. */
  valid_dates: boolean;
  max_days: number;
  within_limit: boolean;
  /** Days over the limit; 0 when within it. */
  over_by_days: number;
  policy: typeof POLICY;
}

const DAY = 86_400_000;

export const daysBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / DAY);

export const maxDays = (sensitivity: Sensitivity) =>
  sensitivity === "privileged" ? POLICY.privileged_max_days : POLICY.standard_max_days;

export function accessMath(input: AccessMathInput): AccessMath {
  const requested_days = daysBetween(input.start_date, input.end_date);
  const max_days = maxDays(input.sensitivity === "privileged" ? "privileged" : "standard");
  const valid_dates = Number.isFinite(requested_days) && requested_days > 0;
  const within_limit = valid_dates && requested_days <= max_days;
  return {
    requested_days: Number.isFinite(requested_days) ? requested_days : 0,
    valid_dates,
    max_days,
    within_limit,
    over_by_days: valid_dates && !within_limit ? requested_days - max_days : 0,
    policy: POLICY,
  };
}

/** A calendar date as the ISO datetime the stores keep. */
export const dayIso = (d: string) => `${d}T00:00:00.000Z`;
