import { REQUESTER } from "../../amodal/_lib/catalog.js";
import { SensitivityPill, StatusPill } from "../components/StatusPill.js";
import { hashOf } from "../routes.js";
import { when, windowDays, type Data } from "../types.js";

export function MyRequests({ data }: { data: Data }) {
  const mine = data.requests.filter((r) => r.requester === REQUESTER).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>My requests</h2>
          <p className="sub">Everything {REQUESTER} has asked for, newest first. A returned request can be edited and resubmitted.</p>
        </div>
      </div>
      {mine.length === 0 ? (
        <div className="empty">
          <p>Nothing requested yet.</p>
          <a href={hashOf({ name: "submit" })}>Request access</a>
        </div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Role</th>
              <th>Window</th>
              <th>Submitted</th>
              <th>Status</th>
              <th className="act"></th>
            </tr>
          </thead>
          <tbody>
            {mine.map((req) => (
              <tr key={req.request_id}>
                <td>
                  <a className="name" href={hashOf({ name: "request", id: req.request_id })}>
                    {req.system} {req.role}
                  </a>{" "}
                  <SensitivityPill sensitivity={req.sensitivity} />
                  <div className="id">
                    {req.request_id}
                    {req.revision > 1 ? ` · rev ${req.revision}` : ""}
                  </div>
                </td>
                <td className="nowrap">
                  {req.start_date} <span className="muted-text">to</span> {req.end_date}
                  <div className="note">{windowDays(req)} days</div>
                </td>
                <td className="nowrap">{when(req.submitted_at)}</td>
                <td>
                  <StatusPill req={req} requester />
                  {req.status === "returned" && req.returned_note ? <div className="note">{req.returned_note}</div> : null}
                </td>
                <td className="act">
                  {req.status === "returned" ? (
                    <a className="btn" href={hashOf({ name: "request", id: req.request_id })}>
                      Edit and resubmit
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
