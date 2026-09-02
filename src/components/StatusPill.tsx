import { REC_LABEL, STATUS_LABEL, type RequestRow, type Sensitivity } from "../types.js";

/** The approver sees the recommendation; a requester sees the status label. */
export function StatusPill({ req, requester }: { req: RequestRow; requester?: boolean }) {
  if (requester) {
    const cls = req.status === "returned" ? "rec-returned" : req.status === "granted" || req.status === "denied" ? "decided" : "muted";
    return <span className={`pill ${cls}`}>{STATUS_LABEL[req.status]}</span>;
  }
  if (req.status === "granted") return <span className="pill decided">Granted</span>;
  if (req.status === "denied") return <span className="pill decided">Denied</span>;
  if (req.status === "returned") return <span className="pill rec-returned">Returned</span>;
  if (!req.recommendation) return <span className="pill muted">Not reviewed</span>;
  return <span className={`pill rec-${req.recommendation}`}>{REC_LABEL[req.recommendation]}</span>;
}

export function SensitivityPill({ sensitivity }: { sensitivity: Sensitivity }) {
  return <span className={`pill sens-${sensitivity}`}>{sensitivity}</span>;
}
