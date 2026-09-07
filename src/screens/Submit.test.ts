import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import * as catalog from "../../amodal/_lib/catalog.js";
import * as policy from "../../amodal/_lib/policy.js";
import * as routes from "../routes.js";
import * as types from "../types.js";
import * as tools from "../tools.js";
import { hooks, jsxRuntime, loadUI, walk } from "../../tests/ui.js";
import { text } from "../../tests/request-ui.js";

function mount(reviewError?: string, refreshFails = false) {
  const state = hooks();
  let submissions = 0;
  let refreshes = 0;
  const result = { request_id: "req_saved", review_error: reviewError };
  const { Submit } = loadUI(new URL("./Submit.tsx", import.meta.url), {
    react: state.react, "react/jsx-runtime": jsxRuntime,
    "@amodalai/react": { useToolRun: () => ({ async run() { submissions++; return { outcome: { kind: "complete" }, result }; } }) },
    "../../amodal/_lib/catalog.js": catalog, "../../amodal/_lib/policy.js": policy,
    "../components/StatusPill.js": { SensitivityPill: () => null },
    "../routes.js": routes, "../types.js": types, "../tools.js": tools,
  });
  const data: types.Data = { requests: [], reviews: new Map(), entitlements: [], events: [], async refetch() {
    refreshes++;
    if (refreshFails) throw new Error("Refresh failed");
  } };
  Object.assign(globalThis, { location: { hash: "#/submit" } });
  const render = () => { state.reset(); return walk(Submit({ data })); };
  return { render, submissions: () => submissions, refreshes: () => refreshes };
}

test("a successful submission opens the saved request", async () => {
  const ui = mount();
  ui.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
  await setImmediate();
  assert.equal(location.hash, "#/request/req_saved");
  assert.equal(ui.submissions(), 1);
});

test("a saved request with a failed review or refresh cannot be submitted twice", async () => {
  for (const [reviewError, refreshFails] of [["Reviewer unavailable", false], [undefined, true]] as const) {
    const ui = mount(reviewError, refreshFails);
    ui.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
    await setImmediate();
    const nodes = ui.render();
    assert.ok(!nodes.some((node) => node.type === "form"));
    assert.match(nodes.map(text).join(" "), /Request submitted/);
    assert.ok(nodes.some((node) => node.type === "a" && node.props.href === "#/request/req_saved"));
    const retry = nodes.find((node) => node.type === "button");
    if (refreshFails) {
      assert.ok(retry);
      retry.props.onClick();
      await setImmediate();
      assert.equal(ui.refreshes(), 2);
    }
    assert.equal(ui.submissions(), 1);
  }
});
