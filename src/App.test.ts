import assert from "node:assert/strict";
import { test } from "node:test";
import * as catalog from "../amodal/_lib/catalog.js";
import * as routes from "./routes.js";
import * as types from "./types.js";
import * as tools from "./tools.js";
import { hooks, jsxRuntime, loadUI, walk } from "../tests/ui.js";

type Query = { data?: Array<{ value: unknown }>; isLoading: boolean; error?: Error; refetch: () => Promise<void> };

function render(overrides: Record<string, Partial<Query>> = {}) {
  const state = hooks();
  const effects: Array<() => void> = [];
  const requests = [{ value: { request_id: "req_1", status: "new" } }];
  const queries = Object.fromEntries(["requests", "entitlements", "reviews", "events"].map((name) => [name, {
    data: name === "requests" ? requests : [], isLoading: false, async refetch() {}, ...overrides[name],
  }])) as Record<string, Query>;
  let seeded = 0;
  const modules: Record<string, unknown> = {
    react: { ...state.react, useRef: () => ({ current: false }), useEffect: (effect: () => void) => effects.push(effect) },
    "react/jsx-runtime": jsxRuntime,
    "@amodalai/react": {
      ChatWidget: () => null, useAmodalContext: () => ({ runtimeUrl: "" }),
      useStoreQuery: (name: string) => queries[name],
      useToolRun: () => ({ status: "idle", async run() { seeded++; return { outcome: { kind: "complete" } }; } }),
    },
    "../amodal/_lib/catalog.js": catalog,
    "./components/ConfirmModal.js": { ConfirmModal: () => null },
    "./components/Sidebar.js": { Sidebar: () => null },
    "./persona.js": { usePersona: () => [{ role: "approver" }], personaFromId: () => ({ role: "approver" }) },
    "./routes.js": routes, "./tools.js": tools, "./types.js": types,
  };
  for (const name of ["History", "MyRequests", "Policy", "Queue", "RequestDetail", "Submit", "Systems"]) {
    modules[`./screens/${name}.js`] = { [name]: () => jsxRuntime.jsx("div", { "data-screen": name }) };
  }
  Object.assign(globalThis, { location: { hash: "#/queue" }, addEventListener() {}, removeEventListener() {} });
  const App = loadUI(new URL("./App.tsx", import.meta.url), modules).default;
  const nodes = walk(App(), true);
  effects.forEach((effect) => effect());
  return { nodes, seeded: () => seeded };
}

test("the queue stays mounted with loaded data, including during a cached refresh", () => {
  const cases: Record<string, Partial<Query>>[] = [{}, { reviews: { isLoading: true } }];
  for (const overrides of cases) {
    assert.ok(render(overrides).nodes.some((node) => node.props["data-screen"] === "Queue"));
  }
});

test("initial reads wait for every store and failed reads expose a retry", () => {
  for (const store of ["requests", "entitlements", "reviews", "events"]) {
    const loading = render({ [store]: { data: undefined, isLoading: true } });
    assert.ok(!loading.nodes.some((node) => node.props["data-screen"]), store);
    const failed = render({ [store]: { data: undefined, error: new Error("Connection failed") } });
    assert.ok(!failed.nodes.some((node) => node.props["data-screen"]), store);
    assert.ok(failed.nodes.some((node) => node.props.role === "alert"), store);
    assert.ok(failed.nodes.some((node) => node.type === "button" && node.props.children === "Retry"), store);
  }
});

test("empty requests do not seed while an auxiliary store is unavailable", () => {
  const ui = render({ requests: { data: [] }, entitlements: { data: undefined, isLoading: true } });
  assert.equal(ui.seeded(), 0);
});
