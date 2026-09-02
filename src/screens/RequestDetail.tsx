import { roleOf } from "../../amodal/_lib/catalog.js";
import { useRequestActions } from "../actions.js";
import { RequestActionButtons } from "../components/RequestActions.js";
import { ReviewBody } from "../components/ReviewBody.js";
import { SensitivityPill, StatusPill } from "../components/StatusPill.js";
import { Timeline } from "../components/Timeline.js";
import { hashOf } from "../routes.js";
import { REC_LABEL, activeAccess, day, latestReview, roleLabel, windowDays, type Data, type RequestRow } from "../types.js";
import { Submit } from "./Submit.js";

/** The role, the window, the justification, and what the requester already holds. */
export function RequestSection({ req, data }: { req: RequestRow; data: Data }) {
  const role = roleOf(req.role_id);
  const held = activeAccess(data, req.requester);
  return (
    <section className="card">
      <h3>Request</h3>
      <dl className="fields">
        <dt>Role</dt>
        <dd>
          {roleLabel(req)} <SensitivityPill sensitivity={req.sensitivity} />
          {role ? <div className="note">{role.purpose}</div> : null}
        </dd>
        <dt>Window</dt>
        <dd>
          {req.start_date} to {req.end_date}, {windowDays(req)} days
        </dd>
        <dt>Requester</dt>
        <dd>
          {req.requester}
          <div className="note">Manager: {req.manager}</div>
        </dd>
        <dt>Ticket</dt>
        <dd>{req.ticket ?? <span className="muted-text">None</span>}</dd>
        <dt>Justification</dt>
        <dd>{req.justification}</dd>
        {req.notes ? (
          <>
            <dt>Notes</dt>
            <dd>{req.notes}</dd>
          </>
        ) : null}
        <dt>Access held</dt>
        <dd>
          {held.length ? (
            <ul className="plain-list">
              {held.map((e) => (
                <li key={e.entitlement_id}>
                  {roleLabel(e)} <SensitivityPill sensitivity={e.sensitivity} />{" "}
                  <span className="muted-text">until {day(e.expires_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted-text">No active roles.</span>
          )}
        </dd>
      </dl>
    </section>
  );
}

/**
 * The requester's view: the request and its status label; on a return, the
 * note, the issues, and the form to resubmit; once decided, the approver's
 * note. No checks, no recommendation, no timeline.
 */
function RequesterDetail({ req, data }: { req: RequestRow; data: Data }) {
  const review = latestReview(data, req);
  return (
    <>
      <RequestSection req={req} data={data} />
      {req.status === "returned" ? (
        <>
          <section className="card">
            <h3>Returned by the system owner</h3>
            <p>{req.returned_note}</p>
            {review?.issues.length ? (
              <ul className="issue-list">
                {review.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </section>
          <Submit data={data} initial={req} />
        </>
      ) : null}
      {req.status === "granted" || req.status === "denied" ? (
        <section className="card">
          <h3>{req.status === "granted" ? "Granted" : "Denied"} by the system owner</h3>
          <p>{req.decision_note ?? <span className="sub">No note.</span>}</p>
        </section>
      ) : null}
    </>
  );
}

export function RequestDetail({ id, data, requester }: { id: string; data: Data; requester: boolean }) {
  const actions = useRequestActions(data);
  const req = data.requests.find((r) => r.request_id === id);
  if (!req) {
    return (
      <div className="empty">
        <p>No request {id}.</p>
        <a href={hashOf({ name: requester ? "mine" : "queue" })}>Back</a>
      </div>
    );
  }
  const review = latestReview(data, req);
  const reviews = data.reviews.get(id) ?? [];
  const events = data.events.filter((e) => e.request_id === id);
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            {roleLabel(req)} for {req.requester}
          </h2>
          <p className="sub">
            {windowDays(req)} days · revision {req.revision} · {req.request_id}
          </p>
        </div>
        <StatusPill req={req} requester={requester} />
      </div>
      {requester ? (
        <RequesterDetail req={req} data={data} />
      ) : (
        <>
          <RequestSection req={req} data={data} />
          <section className="card">
            <h3>Latest review</h3>
            {review ? (
              <>
                <p>
                  <span className={`pill rec-${review.recommendation}`}>{REC_LABEL[review.recommendation]}</span>{" "}
                  <span className="muted-text">revision {review.revision}</span>
                </p>
                <ReviewBody review={review} />
              </>
            ) : (
              <p className="sub">Not reviewed yet.</p>
            )}
          </section>
          <section className="card">
            <h3>Actions</h3>
            <div className="actions">
              <RequestActionButtons req={req} actions={actions} />
            </div>
          </section>
          <section className="card">
            <h3>Timeline</h3>
            <Timeline events={events} reviews={reviews} />
          </section>
          {actions.modal}
        </>
      )}
    </section>
  );
}
