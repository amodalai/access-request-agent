export type Role = "approver" | "requester";

export type Route =
  | { name: "queue" | "systems" | "history" | "policy" | "submit" | "mine" }
  | { name: "request"; id: string };

export type TabName = Exclude<Route, { name: "request" }>["name"];

/** Each persona's tabs, first one is home. */
export const TABS: Record<Role, Array<{ name: TabName; label: string }>> = {
  approver: [
    { name: "queue", label: "Queue" },
    { name: "systems", label: "Systems" },
    { name: "history", label: "History" },
    { name: "policy", label: "Policy" },
  ],
  requester: [
    { name: "submit", label: "New request" },
    { name: "mine", label: "My requests" },
  ],
};

export const hashOf = (route: Route) => (route.name === "request" ? `#/request/${encodeURIComponent(route.id)}` : `#/${route.name}`);

export function parseHash(hash: string): Route | undefined {
  const m = /^#\/([a-z-]+)(?:\/([^/]+))?$/.exec(hash);
  if (!m) return undefined;
  if (m[1] === "request") return m[2] ? { name: "request", id: decodeURIComponent(m[2]) } : undefined;
  const tab = [...TABS.approver, ...TABS.requester].find((t) => t.name === m[1]);
  return tab && !m[2] ? { name: tab.name } : undefined;
}

export const ownsRoute = (role: Role, route: Route) =>
  route.name === "request" || TABS[role].some((t) => t.name === route.name);

/** The persona's route for a hash; an unknown or foreign one redirects home. */
export function resolveRoute(role: Role, hash: string): { route: Route; redirect?: string } {
  const route = parseHash(hash);
  if (route && ownsRoute(role, route)) return { route };
  const home: Route = { name: TABS[role][0].name };
  return { route: home, redirect: hashOf(home) };
}
