import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, reviewed, text } from "../../tests/request-ui.js";

test("the queue shows the request, recommendation, failed checks, and issues", () => {
  const ui = mount();
  reviewed(ui);
  const row = text(ui.rows()[0]);
  for (const value of ["Priya Nair", "AP Approver", "Deny", "segregation failed", "AP Clerk conflicts with AP Approver."]) {
    assert.ok(row.includes(value), value);
  }
  assert.ok(ui.render().some((el) => el.type === "a" && el.props.href === "#/request/req_priya_netsuite_ap_approver"));
});

test("recommendations carry their explanation in the same cell", () => {
  const ui = mount();
  const { review } = reviewed(ui);
  const cells = ui.render().filter((el) => el.type === "td");
  assert.ok(cells.some((el) => text(el).includes("Deny") && text(el).includes(review.issues[0])));
  review.issues = [];
  assert.ok(ui.render().some((el) => el.type === "td" && text(el).includes(review.summary)));
});

test("returned and unreviewed requests do not show an earlier review as current", () => {
  const ui = mount();
  const { req, review } = reviewed(ui);
  req.status = "returned";
  req.returned_note = "Ask for a read-only role.";
  assert.match(text(ui.rows()[0]), /Ask for a read-only role/);
  assert.ok(!text(ui.rows()[0]).includes(review.issues[0]));
  req.status = "new";
  req.recommendation = null;
  assert.match(text(ui.rows()[0]), /Choose Review/);
  assert.ok(!text(ui.rows()[0]).includes(review.issues[0]));
});
