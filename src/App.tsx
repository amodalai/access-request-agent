import { useEffect, useRef, useState } from "react";
import { ChatWidget, useAmodalContext, useStoreQuery, useToolRun } from "@amodalai/react";
import { REQUESTER } from "../amodal/_lib/catalog.js";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { personaFromId, usePersona, type Persona } from "./persona.js";
import { TABS, hashOf, resolveRoute, type Role, type Route } from "./routes.js";
import { History } from "./screens/History.js";
import { MyRequests } from "./screens/MyRequests.js";
import { Policy } from "./screens/Policy.js";
import { Queue } from "./screens/Queue.js";
import { RequestDetail } from "./screens/RequestDetail.js";
import { Submit } from "./screens/Submit.js";
import { Systems } from "./screens/Systems.js";
import { errorMessage, runTool } from "./tools.js";
import { isDecided, type Data, type EntitlementRow, type EventRow, type RequestRow, type ReviewRow } from "./types.js";

function useHashRoute(role: Role): Route {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  const { route, redirect } = resolveRoute(role, hash);
  useEffect(() => {
    if (redirect) location.hash = redirect;
  }, [redirect]);
  return route;
}

function Screen({ route, data, persona }: { route: Route; data: Data; persona: Persona }) {
  const requester = persona.role === "requester";
  switch (route.name) {
    case "request":
      return <RequestDetail id={route.id} data={data} requester={requester} />;
    case "submit":
      return <Submit data={data} />;
    case "mine":
      return <MyRequests data={data} />;
    case "systems":
      return <Systems data={data} />;
    case "history":
      return <History data={data} />;
    case "policy":
      return <Policy />;
    default:
      return <Queue data={data} />;
  }
}

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const [persona, setPersona] = usePersona();
  const route = useHashRoute(persona.role);
  const requestsQ = useStoreQuery<RequestRow>("requests", { limit: 1000 });
  const entitlementsQ = useStoreQuery<EntitlementRow>("entitlements", { limit: 1000 });
  const reviewsQ = useStoreQuery<ReviewRow>("reviews", { limit: 1000 });
  const eventsQ = useStoreQuery<EventRow>("events", { limit: 1000 });
  const seed = useToolRun("seed_examples");
  const reset = useToolRun("reset_demo");
  const seededRef = useRef(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();

  const reviews = new Map<string, ReviewRow[]>();
  for (const { value } of reviewsQ.data ?? []) reviews.set(value.request_id, [...(reviews.get(value.request_id) ?? []), value]);
  for (const list of reviews.values()) list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const data: Data = {
    requests: (requestsQ.data ?? []).map((r) => r.value),
    entitlements: (entitlementsQ.data ?? []).map((r) => r.value),
    reviews,
    events: (eventsQ.data ?? []).map((r) => r.value).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    refetch: async () => {
      await Promise.all([requestsQ.refetch(), entitlementsQ.refetch(), reviewsQ.refetch(), eventsQ.refetch()]);
    },
  };

  async function runSeed() {
    setSeedError(null);
    try {
      await runTool(seed, {});
      await data.refetch();
    } catch (err) {
      setSeedError(errorMessage(err, "Loading the demo failed."));
    }
  }

  const empty = !requestsQ.isLoading && !requestsQ.error && data.requests.length === 0;
  useEffect(() => {
    if (!empty || seededRef.current) return;
    seededRef.current = true;
    void runSeed();
  }, [empty]);

  async function onReset() {
    setResetting(true);
    setResetError(undefined);
    try {
      await runTool(reset, {});
      await data.refetch();
      setConfirmReset(false);
    } catch (err) {
      setResetError(errorMessage(err, "The reset failed."));
    } finally {
      setResetting(false);
    }
  }

  function switchPersona(id: string) {
    const next = personaFromId(id);
    setPersona(next);
    location.hash = hashOf({ name: TABS[next.role][0].name });
  }

  const counts =
    persona.role === "requester"
      ? { mine: data.requests.filter((r) => r.requester === REQUESTER && r.status === "returned").length }
      : { queue: data.requests.filter((r) => !isDecided(r)).length };

  return (
    <div className="app">
      <Sidebar
        persona={persona}
        route={route}
        counts={counts}
        onSwitch={switchPersona}
        onReset={() => {
          setResetError(undefined);
          setConfirmReset(true);
        }}
      />
      <main className="page">
        {seedError ? (
          <div className="banner error">
            {seedError}{" "}
            <button className="btn btn--ghost" onClick={() => void runSeed()}>
              Retry
            </button>
          </div>
        ) : null}

        {requestsQ.isLoading ? (
          <div className="empty">Loading…</div>
        ) : seed.status === "running" ? (
          <div className="empty">Loading the demo…</div>
        ) : (
          <Screen route={route} data={data} persona={persona} />
        )}

        <footer className="foot">
          Fictional demo. People, systems, roles, and the access policy are made up. The agent assists; a human decides.
          Nothing is provisioned anywhere.
        </footer>
      </main>

      {confirmReset ? (
        <ConfirmModal
          title="Reset demo data"
          confirmLabel="Reset"
          busy={resetting}
          error={resetError}
          onConfirm={() => void onReset()}
          onCancel={() => setConfirmReset(false)}
        >
          <p className="sub">This deletes every request, entitlement, review, and event and reloads the demo. Continue?</p>
        </ConfirmModal>
      ) : null}

      <ChatWidget
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: persona.role }}
        getToken={async () => ""}
        agent="default"
        theme={{ primaryColor: "#0f766e", mode: "light" }}
        onStreamEnd={() => {
          void data.refetch();
        }}
      />
    </div>
  );
}
