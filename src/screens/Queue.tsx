import { useRequestActions } from "../actions.js";
import { RequestTable } from "../components/RequestTable.js";
import type { Data } from "../types.js";

export function Queue({ data }: { data: Data }) {
  const actions = useRequestActions(data);
  const requests = data.requests
    .filter((r) => r.status === "new" || r.status === "reviewed" || r.status === "returned")
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const pending = requests.filter((r) => r.status === "new" && !actions.reviewing.has(r.request_id));
  const queued = actions.reviewing.size - (actions.activeReview ? 1 : 0);
  const reviewLabel = actions.activeReview ? `Reviewing 1${queued ? ` · ${queued} queued` : ""}…` : queued ? `Queued ${queued}…` : undefined;

  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            Access requests
            {requests.length ? <span className="screen__count">{requests.length}</span> : null}
          </h2>
          <p className="sub">
            Employees asking for access to business systems. The agent checks their existing access, the requested dates,
            and the reason against the access policy. You review its recommendation and decide whether to grant, return, or deny.
          </p>
        </div>
        <button className="btn" disabled={pending.length === 0} onClick={() => pending.forEach((r) => actions.onReview(r.request_id))}>
          {reviewLabel ?? (pending.length > 1 ? `Review all ${pending.length}` : "Review")}
        </button>
      </div>
      <p className="sub queue-guide">
        Limit means a shorter period or narrower role is needed. Escalate means security sign-off is needed.
        Open a request to see the full review.
      </p>
      {requests.length === 0 ? (
        <div className="empty">
          <p>Nothing to review. Submit a request as an employee, or reset the demo.</p>
        </div>
      ) : (
        <RequestTable requests={requests} data={data} actions={actions} />
      )}
      {actions.modal}
    </section>
  );
}
