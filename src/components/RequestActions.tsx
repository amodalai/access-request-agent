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
      ) : (
        <div className="act-row">
          <button className="btn btn--review" disabled={busy} onClick={() => actions.onReview(req.request_id)}>
            {busy ? "Reviewing…" : req.review_id ? "Re-review" : "Review"}
          </button>
          {req.status === "reviewed" ? (
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
