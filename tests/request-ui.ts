import { REQUESTS, requestRow } from "../amodal/_lib/demo-data.js";
import { serial } from "../src/serial.js";
import * as tools from "../src/tools.js";
import * as types from "../src/types.js";
import * as routes from "../src/routes.js";
import { hooks, jsxRuntime, loadUI, walk, type Element } from "./ui.js";

export function mount() {
  const state = hooks();
  const started: string[] = [];
  const finish: Array<(value: unknown) => void> = [];
  const data: types.Data = {
    requests: REQUESTS.slice(0, 2).map((req) => requestRow(req, "2026-09-01")),
    entitlements: [], reviews: new Map(), events: [], async refetch() {},
  };
  const base = { react: state.react, "react/jsx-runtime": jsxRuntime };
  const { useRequestActions } = loadUI(new URL("../src/actions.tsx", import.meta.url), {
    ...base,
    "@amodalai/react": { useToolRun: () => ({ run({ request_id }: { request_id: string }) {
      started.push(request_id);
      return new Promise((resolve) => finish.push(resolve));
    } }) },
    "./components/DecideModal.js": { DecideModal: () => null },
    "./serial.js": { serial }, "./tools.js": tools, "./types.js": types,
  });
  const buttons = loadUI(new URL("../src/components/RequestActions.tsx", import.meta.url), {
    ...base, "../types.js": types,
  });
  const pills = loadUI(new URL("../src/components/StatusPill.tsx", import.meta.url), {
    ...base, "../types.js": types,
  });
  const { RequestTable } = loadUI(new URL("../src/components/RequestTable.tsx", import.meta.url), {
    ...base, "../routes.js": routes, "../types.js": types,
    "./RequestActions.js": buttons, "./StatusPill.js": pills,
  });
  const { Queue } = loadUI(new URL("../src/screens/Queue.tsx", import.meta.url), {
    ...base, "../actions.js": { useRequestActions },
    "../components/RequestTable.js": { RequestTable },
  });
  const render = () => { state.reset(); return walk(Queue({ data }), true); };
  const rows = () => render().filter((el) => el.type === "tr").slice(1);
  const header = () => render().find((el) => el.type === "button")!;
  return { data, started, finish, render, rows, header };
}

export function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) {
    const el = node as Element;
    return text(typeof el.type === "function" ? el.type(el.props) : el.props.children);
  }
  return node == null ? "" : String(node);
}

export function reviewed(ui: ReturnType<typeof mount>) {
  const req = ui.data.requests[1];
  req.status = "reviewed";
  req.recommendation = "deny";
  req.review_id = "review_1";
  const review: types.ReviewRow = {
    review_id: "review_1", request_id: req.request_id, revision: 1, recommendation: "deny",
    summary: "This role conflicts with the access Priya already holds.",
    checks: [{ name: "segregation", status: "fail", note: "AP Clerk conflicts with AP Approver." }],
    issues: ["AP Clerk conflicts with AP Approver."], created_at: "2026-09-01",
  };
  ui.data.reviews.set(req.request_id, [review]);
  return { req, review };
}
