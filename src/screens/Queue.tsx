import { useRequestActions } from "../actions.js";
import { RequestTable } from "../components/RequestTable.js";
import type { Data } from "../types.js";

export function Queue({ data }: { data: Data }) {
  const actions = useRequestActions(data);
  const requests = data.requests
    .filter((r) => r.status === "new" || r.status === "reviewed" || r.status === "returned")
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const pending = requests.filter((r) => r.status === "new" && !actions.reviewing.has(r.request_id));

  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            Queue
            {requests.length ? <span className="screen__count">{requests.length}</span> : null}
          </h2>
          <p className="sub">
            The agent checks each request against the access policy and recommends <em>grant</em>, <em>limit</em>,{" "}
            <em>escalate</em>, or <em>deny</em>. You decide.
          </p>
        </div>
        <button className="btn" disabled={pending.length === 0} onClick={() => pending.forEach((r) => actions.onReview(r.request_id))}>
          {actions.reviewing.size > 0 ? `Reviewing ${actions.reviewing.size}…` : "Review all"}
        </button>
      </div>
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
