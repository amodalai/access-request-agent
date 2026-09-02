import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY, accessMath, dayIso, daysBetween, maxDays } from "../amodal/_lib/policy.js";

test("counts the days between two dates", () => {
  assert.equal(daysBetween("2026-09-02", "2026-09-16"), 14);
  assert.equal(daysBetween("2026-09-01", "2027-08-31"), 364);
  assert.equal(daysBetween("2026-09-01", "2026-09-01"), 0);
  assert.equal(dayIso("2026-09-01"), "2026-09-01T00:00:00.000Z");
});

test("the limit follows the sensitivity", () => {
  assert.equal(maxDays("privileged"), POLICY.privileged_max_days);
  assert.equal(maxDays("standard"), POLICY.standard_max_days);
  const m = accessMath({ start_date: "2026-09-02", end_date: "2026-09-16", sensitivity: "privileged" });
  assert.deepEqual([m.requested_days, m.max_days, m.within_limit, m.over_by_days, m.valid_dates], [14, 30, true, 0, true]);
  assert.equal(accessMath({ start_date: "2026-09-01", end_date: "2026-10-01", sensitivity: "privileged" }).within_limit, true);
  assert.equal(accessMath({ start_date: "2026-09-01", end_date: "2026-10-02", sensitivity: "privileged" }).over_by_days, 1);
});

test("a standard window over a year is over by the difference", () => {
  const m = accessMath({ start_date: "2026-09-01", end_date: "2027-10-31", sensitivity: "standard" });
  assert.equal(m.requested_days, 425);
  assert.equal(m.within_limit, false);
  assert.equal(m.over_by_days, 60);
  assert.equal(m.policy, POLICY);
});

test("an end date on or before the start is invalid, and an unknown sensitivity counts as standard", () => {
  const m = accessMath({ start_date: "2026-09-10", end_date: "2026-09-01", sensitivity: "standard" });
  assert.deepEqual([m.valid_dates, m.within_limit, m.over_by_days, m.requested_days], [false, false, 0, -9]);
  assert.equal(accessMath({ start_date: "2026-09-01", end_date: "2026-09-01", sensitivity: "standard" }).valid_dates, false);
  assert.equal(accessMath({ start_date: "nope", end_date: "2026-09-01", sensitivity: "standard" }).requested_days, 0);
  assert.equal(accessMath({ start_date: "2026-09-01", end_date: "2026-10-01", sensitivity: "weird" as "standard" }).max_days, 365);
});
