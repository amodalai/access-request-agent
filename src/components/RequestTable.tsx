import type { RequestActions } from "../actions.js";
import { hashOf } from "../routes.js";
import { latestReview, windowDays, type Data, type RequestRow } from "../types.js";
import { RequestActionButtons } from "./RequestActions.js";
import { SensitivityPill, StatusPill } from "./StatusPill.js";

function Row({ req, data, actions }: { req: RequestRow; data: Data; actions: RequestActions }) {
  const review = latestReview(data, req);
  const durationNote = review?.checks?.find((c) => c.name === "duration")?.note?.trim();
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
      <td className="nowrap">
        <div>
          {req.start_date} <span className="muted-text">to</span> {req.end_date}
        </div>
        <div className="note">{windowDays(req)} days</div>
      </td>
      <td>
        <StatusPill req={req} />
        {durationNote ? <div className="note">{durationNote}</div> : null}
      </td>
      <td className="issues">
        {review?.issues?.length ? (
          <ul className="issue-list">
            {review.issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
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
          <th>Window</th>
          <th>Recommendation</th>
          <th>Issues</th>
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
