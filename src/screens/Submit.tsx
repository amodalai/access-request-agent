import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { PEOPLE, REQUESTER, ROLES, roleOf } from "../../amodal/_lib/catalog.js";
import { maxDays } from "../../amodal/_lib/policy.js";
import { SensitivityPill } from "../components/StatusPill.js";
import { hashOf } from "../routes.js";
import { errorMessage, runTool } from "../tools.js";
import { activeAccess, roleLabel, type Data, type RequestRow } from "../types.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (days: number) => isoDay(new Date(Date.now() + days * 86_400_000));
const SYSTEMS = [...new Set(ROLES.map((r) => r.system))];
type SubmissionResult = { request_id: string; review_error?: string };

/** The request form. With `initial` it resubmits that returned request. */
export function Submit({ data, initial }: { data: Data; initial?: RequestRow }) {
  const submit = useToolRun<Record<string, unknown>>("submit_request");
  const [roleId, setRoleId] = useState(initial?.role_id ?? ROLES[0].role_id);
  const [startDate, setStartDate] = useState(initial?.start_date ?? plusDays(0));
  const [endDate, setEndDate] = useState(initial?.end_date ?? plusDays(90));
  const [justification, setJustification] = useState(initial?.justification ?? "");
  const [ticket, setTicket] = useState(initial?.ticket ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SubmissionResult | null>(null);

  const role = roleOf(roleId);
  const held = activeAccess(data, REQUESTER);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await runTool<Record<string, unknown>, SubmissionResult>(submit, {
        ...(initial ? { request_id: initial.request_id } : {}),
        role_id: roleId,
        start_date: startDate,
        end_date: endDate,
        justification,
        ticket: ticket || null,
        notes: notes || null,
        requester: REQUESTER,
      });
      if (!result?.request_id) throw new Error("Check My requests before submitting again; the saved request id was not returned.");
      setSaved(result);
      await data.refetch();
      if (!result.review_error) location.hash = hashOf({ name: "request", id: result.request_id });
    } catch (err) {
      setError(errorMessage(err, "The submission failed."));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSaved() {
    setBusy(true);
    setError(null);
    try {
      await data.refetch();
    } catch (err) {
      setError(errorMessage(err, "The status could not be refreshed."));
    } finally {
      setBusy(false);
    }
  }

  if (saved) return (
    <section className="card">
      {initial ? <h3>Request submitted</h3> : <h1>Request submitted</h1>}
      <p role="status">
        {saved.review_error
          ? "Your request is saved, but its review could not finish. The system owner can retry it from the queue."
          : "Your request is saved and reviewed."}
      </p>
      {saved.review_error ? <p className="sub">{saved.review_error}</p> : null}
      {error ? (
        <div className="banner error" role="alert">
          The request is saved, but its status could not be refreshed. {error}{" "}
          <button className="btn btn--ghost" disabled={busy} onClick={() => void refreshSaved()}>Retry refresh</button>
        </div>
      ) : null}
      <a className="btn" href={hashOf({ name: "request", id: saved.request_id })}>View request</a>
    </section>
  );

  return (
    <form className="card form" aria-busy={busy} onSubmit={(e) => void onSubmit(e)}>
      {initial ? <h3>Edit and resubmit your request</h3> : <h1>Request access</h1>}
      <p className="sub">
        Requesting as <strong>{REQUESTER}</strong>, manager {PEOPLE[REQUESTER].manager}.
        {held.length ? ` Roles held: ${held.map(roleLabel).join(", ")}.` : " No roles held."}
      </p>
      <div className="form__row">
        <label>
          Role
          <select disabled={busy} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {SYSTEMS.map((system) => (
              <optgroup key={system} label={system}>
                {ROLES.filter((r) => r.system === system).map((r) => (
                  <option key={r.role_id} value={r.role_id}>
                    {r.role}
                    {r.sensitivity === "privileged" ? " (privileged)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {role ? (
        <p className="sub form__hint">
          <SensitivityPill sensitivity={role.sensitivity} /> {role.purpose} Granted for at most {maxDays(role.sensitivity)} days at a
          time.
        </p>
      ) : null}
      <div className="form__row">
        <label>
          Start date
          <input type="date" required disabled={busy} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" required disabled={busy} min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <label>
        Justification
        <textarea
          required
          disabled={busy}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="What you need the role for, in your own words"
        />
      </label>
      <div className="form__row">
        <label>
          Ticket (optional)
          <input disabled={busy} value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Onboarding, incident, or change ticket, if any" />
        </label>
        <label>
          Notes (optional)
          <input disabled={busy} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the system owner should know" />
        </label>
      </div>
      {error ? <div className="banner error" role="alert">{error}</div> : null}
      <div className="modal__actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Submitting and reviewing…" : initial ? "Resubmit" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}
