import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, reviewed } from "../../tests/request-ui.js";

test("the queue excludes decided requests and disables bulk review without new requests", () => {
  const ui = mount();
  reviewed(ui);
  ui.data.requests[0].status = "granted";
  assert.equal(ui.rows().length, 1);
  assert.equal(ui.header().props.disabled, true);
});
