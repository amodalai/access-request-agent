import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, hashOf, ownsRoute, parseHash, resolveRoute } from "../src/routes.js";

test("parses the tab and request hashes and nothing else", () => {
  assert.deepEqual(parseHash("#/queue"), { name: "queue" });
  assert.deepEqual(parseHash("#/systems"), { name: "systems" });
  assert.deepEqual(parseHash("#/request/req_tom_aws_prod_admin"), { name: "request", id: "req_tom_aws_prod_admin" });
  assert.deepEqual(parseHash("#/request/req%20x"), { name: "request", id: "req x" });
  for (const bad of ["", "#", "#/", "#/nope", "#/request", "#/request/", "#/queue/extra", "#/request/a/b", "#/invoice/x"]) {
    assert.equal(parseHash(bad), undefined, bad);
  }
});

test("hashOf round-trips every route", () => {
  for (const t of [...TABS.approver, ...TABS.requester]) assert.deepEqual(parseHash(hashOf({ name: t.name })), { name: t.name });
  assert.deepEqual(parseHash(hashOf({ name: "request", id: "req x" })), { name: "request", id: "req x" });
});

test("each persona owns its tabs and the request detail, and is redirected home otherwise", () => {
  assert.equal(ownsRoute("approver", { name: "queue" }), true);
  assert.equal(ownsRoute("approver", { name: "submit" }), false);
  assert.equal(ownsRoute("requester", { name: "mine" }), true);
  assert.equal(ownsRoute("requester", { name: "history" }), false);
  assert.equal(ownsRoute("requester", { name: "request", id: "x" }), true);
  assert.deepEqual(resolveRoute("approver", "#/history"), { route: { name: "history" } });
  assert.deepEqual(resolveRoute("requester", "#/request/req_x"), { route: { name: "request", id: "req_x" } });
  assert.deepEqual(resolveRoute("requester", "#/queue"), { route: { name: "submit" }, redirect: "#/submit" });
  assert.deepEqual(resolveRoute("approver", "#/mine"), { route: { name: "queue" }, redirect: "#/queue" });
  assert.deepEqual(resolveRoute("approver", ""), { route: { name: "queue" }, redirect: "#/queue" });
  assert.deepEqual(resolveRoute("requester", "#/garbage"), { route: { name: "submit" }, redirect: "#/submit" });
});
