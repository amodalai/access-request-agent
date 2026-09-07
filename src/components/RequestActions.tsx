import type { RequestActions } from "../actions.js";
import { isDecided, type RequestRow } from "../types.js";

/** Review, and on a reviewed request Grant / Return / Deny. Hidden once decided. */
export function RequestActionButtons({ req, actions }: { req: RequestRow; actions: RequestActions }) {
  const busy = actions.reviewing.has(req.request_id);
  const error = actions.errors.get(req.request_id);
  return (
    <>
      {error ? <div className="row-error">{error}</div> : null}
      {isDecided(req) ? (
        req.decision_note ? <div className="note">{req.decision_note}</div> : null
      ) : req.status === "returned" ? (
        <div className="note">Waiting for the requester to edit and resubmit.</div>
      ) : (
        <div className="act-row">
          <button className="btn btn--review" disabled={busy} onClick={() => actions.onReview(req.request_id)}>
            {busy ? (actions.activeReview === req.request_id ? "Reviewing…" : "Queued…") : req.review_id ? "Re-review" : "Review"}
          </button>
          {req.status === "reviewed" && !busy ? (
            <div className="decide">
              <button className="btn btn--ghost" onClick={() => actions.onDecide(req, "granted")}>
                Grant
              </button>
              <button className="btn btn--ghost" onClick={() => actions.onDecide(req, "returned")}>
                Return
              </button>
              <button className="btn btn--ghost" onClick={() => actions.onDecide(req, "denied")}>
                Deny
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
