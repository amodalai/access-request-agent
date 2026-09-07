import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, reviewed, text } from "../../tests/request-ui.js";
import { walk } from "../../tests/ui.js";
import { setImmediate } from "node:timers/promises";

test("reviewed requests offer re-review and human decisions", () => {
  const ui = mount();
  reviewed(ui);
  const buttons = walk(ui.rows()[0], true).filter((el) => el.type === "button");
  assert.deepEqual(buttons.map(text), ["Re-review", "Grant", "Return", "Deny"]);
});

test("a re-review hides decisions and the earlier verdict until it finishes", async () => {
  const ui = mount();
  const { review } = reviewed(ui);
  const buttons = () => walk(ui.rows()[0], true).filter((el) => el.type === "button");
  buttons()[0].props.onClick();
  assert.deepEqual(buttons().map(text), ["Queued…"]);
  assert.equal(buttons()[0].props.disabled, true);
  await setImmediate();
  assert.deepEqual(buttons().map(text), ["Reviewing…"]);
  assert.ok(!text(ui.rows()[0]).includes(review.issues[0]));
  ui.finish[0]({ outcome: { kind: "complete" } });
  await setImmediate();
  assert.deepEqual(buttons().map(text), ["Re-review", "Grant", "Return", "Deny"]);
});
