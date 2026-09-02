import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_LABEL, activeAccess, roleLabel, windowDays, type Data, type EntitlementRow } from "../src/types.js";

const ent = (person: string, role_id: string, status: EntitlementRow["status"]): EntitlementRow => ({
  entitlement_id: `ent_${person}_${role_id}`,
  person,
  role_id,
  system: role_id.split(".")[0],
  role: role_id.split(".")[1],
  sensitivity: "standard",
  granted_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2026-12-31T00:00:00.000Z",
  source_request_id: null,
  status,
});

const data = (entitlements: EntitlementRow[]): Data => ({ requests: [], entitlements, reviews: new Map(), events: [], refetch: async () => {} });

test("windowDays counts the days a request covers", () => {
  assert.equal(windowDays({ start_date: "2026-09-02", end_date: "2026-09-16" }), 14);
  assert.equal(windowDays({ start_date: "2026-09-01", end_date: "2027-08-31" }), 364);
});

test("activeAccess lists one person's active roles, sorted by label", () => {
  const rows = [ent("priya", "snowflake.analyst", "active"), ent("priya", "netsuite.ap_clerk", "active"), ent("priya", "okta.admin", "expired"), ent("tom", "aws.prod_read", "active")];
  assert.deepEqual(activeAccess(data(rows), "priya").map(roleLabel), ["netsuite ap_clerk", "snowflake analyst"]);
  assert.deepEqual(activeAccess(data(rows), "nobody"), []);
});

test("a requester sees under review until a decision or a return", () => {
  assert.equal(STATUS_LABEL.new, STATUS_LABEL.reviewed);
  assert.equal(STATUS_LABEL.returned, "Returned, action needed");
});
