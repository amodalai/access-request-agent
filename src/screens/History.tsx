import { useState } from "react";
import { KIND_LABEL } from "../components/Timeline.js";
import { hashOf } from "../routes.js";
import { REC_LABEL, roleLabel, when, type Data, type EventRow } from "../types.js";

const CHIPS: Array<{ label: string; kinds: Array<EventRow["kind"]> }> = [
  { label: "All", kinds: [] },
  { label: "Submitted", kinds: ["submitted", "resubmitted"] },
  { label: "Reviewed", kinds: ["reviewed"] },
  { label: "Returned", kinds: ["returned"] },
  { label: "Granted", kinds: ["granted"] },
  { label: "Denied", kinds: ["denied"] },
  { label: "System", kinds: ["seeded", "reset"] },
];

export function History({ data }: { data: Data }) {
  const [chip, setChip] = useState(0);
  const [text, setText] = useState("");
  const byId = new Map(data.requests.map((r) => [r.request_id, r]));
  const q = text.trim().toLowerCase();
  const events = data.events.filter((e) => {
    if (CHIPS[chip].kinds.length && !CHIPS[chip].kinds.includes(e.kind)) return false;
    if (!q) return true;
    const req = e.request_id ? byId.get(e.request_id) : undefined;
    return (
      (e.request_id ?? "").toLowerCase().includes(q) ||
      (req ? `${req.requester} ${roleLabel(req)}`.toLowerCase().includes(q) : false)
    );
  });
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>History</h2>
          <p className="sub">Every action on every request, newest first, from the events store.</p>
        </div>
        <input className="filter" placeholder="Person, role, or request id" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="chips">
        {CHIPS.map((c, i) => (
          <button key={c.label} className={`chip${chip === i ? " active" : ""}`} onClick={() => setChip(i)}>
            {c.label}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <div className="empty">No events match.</div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Event</th>
              <th>Request</th>
              <th>Recommendation or note</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const req = e.request_id ? byId.get(e.request_id) : undefined;
              return (
                <tr key={e.event_id}>
                  <td className="nowrap">{when(e.created_at)}</td>
                  <td>{e.actor}</td>
                  <td>
                    {KIND_LABEL[e.kind]}
                    {e.revision && e.revision > 1 ? <span className="muted-text"> rev {e.revision}</span> : null}
                  </td>
                  <td>
                    {e.request_id ? (
                      <a href={hashOf({ name: "request", id: e.request_id })}>
                        {req ? `${roleLabel(req)} for ${req.requester}` : e.request_id}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {e.recommendation ? <span className={`pill rec-${e.recommendation}`}>{REC_LABEL[e.recommendation]}</span> : null}
                    {e.note ? <div className="note">{e.note}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
