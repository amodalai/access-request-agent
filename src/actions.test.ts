import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { mount, text } from "../tests/request-ui.js";

for (const failed of [false, true]) {
  test(`reviews run serially and continue after ${failed ? "failure" : "success"}`, async () => {
    const ui = mount();
    ui.header().props.onClick();
    await setImmediate();
    assert.deepEqual(ui.started, [ui.data.requests[1].request_id]);
    ui.finish[0]({ outcome: failed ? { kind: "failed", reason: "Review failed" } : { kind: "completed" } });
    await setImmediate();
    assert.deepEqual(ui.started, ui.data.requests.map((r) => r.request_id).reverse());
    ui.finish[1]({ outcome: { kind: "completed" } });
    await setImmediate();
    assert.equal(ui.header().props.disabled, false);
});
}

for (const failed of [false, true]) {
  test(`queued requests become active after ${failed ? "failure" : "success"}`, async () => {
    const ui = mount();
    ui.header().props.onClick();
    assert.equal(text(ui.header()), "Queued 2…");
    await setImmediate();
    assert.equal(text(ui.header()), "Reviewing 1 · 1 queued…");
    assert.match(text(ui.rows()[0]), /Reviewing request/);
    assert.match(text(ui.rows()[1]), /Queued for review/);
    assert.doesNotMatch(text(ui.rows()[1]), /Reviewing/);
    ui.finish[0]({ outcome: failed ? { kind: "failed", reason: "Review failed" } : { kind: "completed" } });
    await setImmediate();
    assert.equal(text(ui.header()), "Reviewing 1…");
    assert.doesNotMatch(text(ui.rows()[0]), /Reviewing request|Queued for review/);
    assert.match(text(ui.rows()[1]), /Reviewing request/);
    if (failed) assert.match(text(ui.rows()[0]), /Review failed/);
    ui.finish[1]({ outcome: { kind: "completed" } });
    await setImmediate();
    assert.equal(text(ui.header()), "Review all 2");
  });
}
