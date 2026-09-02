import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal.js";
import { REC_LABEL, roleLabel, windowDays, type Decision, type Recommendation, type RequestRow } from "../types.js";

const VERB: Record<Decision, string> = { granted: "Grant", denied: "Deny", returned: "Return" };

export function DecideModal({
  req,
  decision,
  recommendation,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  req: RequestRow;
  decision: Decision;
  recommendation?: Recommendation;
  busy: boolean;
  error?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const noteRequired = decision === "returned" || (decision === "granted" && recommendation === "escalate");
  const copy = {
    granted: `This records your grant and adds ${roleLabel(req)} to ${req.requester}'s entitlements until ${req.end_date}. The hard rules of the access policy are re-checked first. Nothing is provisioned in a real system.`,
    denied: "This records your denial. The requester sees it on their list.",
    returned: `This sends the request back to ${req.requester} with your note. They can edit it and resubmit.`,
  }[decision];
  const help =
    decision === "returned"
      ? "A note is required: it tells the requester what to change."
      : noteRequired
        ? "A note is required: the review recommended escalating this request."
        : "Optional note";
  return (
    <ConfirmModal
      title={`${VERB[decision]} ${roleLabel(req)} for ${req.requester}`}
      confirmLabel={`Confirm ${VERB[decision].toLowerCase()}`}
      busy={busy}
      disabled={noteRequired && !note.trim()}
      error={error}
      onConfirm={() => onConfirm(note.trim())}
      onCancel={onCancel}
    >
      <p className="sub">{copy}</p>
      <dl className="modal__fields">
        <dt>Role</dt>
        <dd>{roleLabel(req)}</dd>
        <dt>Window</dt>
        <dd>
          {req.start_date} to {req.end_date}, {windowDays(req)} days
        </dd>
        <dt>Requester</dt>
        <dd>{req.requester}</dd>
        <dt>Recommendation</dt>
        <dd>{recommendation ? REC_LABEL[recommendation] : "—"}</dd>
      </dl>
      <textarea className="modal__note" placeholder={help} value={note} onChange={(e) => setNote(e.target.value)} />
      {noteRequired ? <p className="sub">{help}</p> : null}
    </ConfirmModal>
  );
}
