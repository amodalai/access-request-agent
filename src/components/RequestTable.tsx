import type { RequestActions } from "../actions.js";
import { hashOf } from "../routes.js";
import { latestReview, windowDays, type Data, type RequestRow } from "../types.js";
import { RequestActionButtons } from "./RequestActions.js";
import { SensitivityPill, StatusPill } from "./StatusPill.js";

function Row({ req, data, actions }: { req: RequestRow; data: Data; actions: RequestActions }) {
  const busy = actions.reviewing.has(req.request_id);
  const review = req.status === "reviewed" && !busy ? latestReview(data, req) : undefined;
  const flagged = review?.checks?.filter((c) => c.status !== "pass") ?? [];
  return (
    <tr>
      <td>
        <a className="name" href={hashOf({ name: "request", id: req.request_id })}>
          {req.requester}
        </a>
        <div className="id">
          {req.request_id}
          {req.revision > 1 ? ` · rev ${req.revision}` : ""}
          {req.ticket ? ` · ${req.ticket}` : ""}
        </div>
        {req.notes ? <div className="note">{req.notes}</div> : null}
      </td>
      <td className="role">
        <div className="role__name">
          {req.system} <strong>{req.role}</strong>
        </div>
        <SensitivityPill sensitivity={req.sensitivity} />
        <div className="note role__why" title={req.justification}>
          {req.justification}
        </div>
      </td>
      <td>
        <div>
          {req.start_date} <span className="muted-text">to</span> {req.end_date}
        </div>
        <div className="note">{windowDays(req)} days</div>
      </td>
      <td className="verdict">
        {busy ? (
          <span className="pill muted" role="status">
            {actions.activeReview === req.request_id ? "Reviewing request…" : "Queued for review…"}
          </span>
        ) : (
          <StatusPill req={req} />
        )}
        {review?.issues?.length ? (
          <ul className="issue-list reason">
            {review.issues.map((m) => <li key={m}>{m}</li>)}
          </ul>
        ) : review?.summary ? <div className="reason">{review.summary}</div> : null}
        {req.status === "returned" && !busy && req.returned_note ? <div className="reason">{req.returned_note}</div> : null}
        {req.status === "new" && !busy ? <div className="note">Choose Review to check this request.</div> : null}
        {flagged.length ? (
          <div className="checks">
            {flagged.map((c) => (
              <span key={c.name} className={`pill check-${c.status}`} title={c.note}>
                {c.name} {c.status === "fail" ? "failed" : "flagged"}
              </span>
            ))}
          </div>
        ) : review?.checks?.length ? (
          <div className="note">All {review.checks.length} checks pass</div>
        ) : null}
      </td>
      <td className="act">
        <RequestActionButtons req={req} actions={actions} />
      </td>
    </tr>
  );
}

export function RequestTable({ requests, data, actions }: { requests: RequestRow[]; data: Data; actions: RequestActions }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Requester</th>
          <th>Role</th>
          <th>Access period</th>
          <th>Recommendation</th>
          <th className="act"></th>
        </tr>
      </thead>
      <tbody>
        {requests.map((req) => (
          <Row key={req.request_id} req={req} data={data} actions={actions} />
        ))}
      </tbody>
    </table>
  );
}
