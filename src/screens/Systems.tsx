import { ROLES, conflictsOf, roleOf } from "../../amodal/_lib/catalog.js";
import { SensitivityPill } from "../components/StatusPill.js";
import { hashOf } from "../routes.js";
import { day, roleLabel, type Data } from "../types.js";

export function Systems({ data }: { data: Data }) {
  const open = data.requests.filter((r) => r.status === "new" || r.status === "reviewed" || r.status === "returned");
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>Systems</h2>
          <p className="sub">Every role an employee can ask for, what it is for, which roles it may not be combined with, and who holds it today.</p>
        </div>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Role</th>
            <th>Purpose</th>
            <th>Conflicts with</th>
            <th>Holders</th>
            <th>Open requests</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => {
            const holders = data.entitlements.filter((e) => e.role_id === role.role_id && e.status === "active");
            const asking = open.filter((r) => r.role_id === role.role_id);
            return (
              <tr key={role.role_id}>
                <td>
                  <div className="role__name">
                    {role.system} <strong>{role.role}</strong>
                  </div>
                  <SensitivityPill sensitivity={role.sensitivity} />
                  <div className="id">{role.role_id}</div>
                </td>
                <td className="note">{role.purpose}</td>
                <td>
                  {conflictsOf(role.role_id).length ? (
                    <ul className="plain-list">
                      {conflictsOf(role.role_id).map((id) => (
                        <li key={id}>{roleLabel(roleOf(id)!)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted-text">—</span>
                  )}
                </td>
                <td>
                  {holders.length ? (
                    <ul className="plain-list">
                      {holders.map((e) => (
                        <li key={e.entitlement_id}>
                          {e.person} <span className="muted-text">until {day(e.expires_at)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted-text">Nobody</span>
                  )}
                </td>
                <td>
                  {asking.length ? (
                    <ul className="plain-list">
                      {asking.map((r) => (
                        <li key={r.request_id}>
                          <a href={hashOf({ name: "request", id: r.request_id })}>{r.requester}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted-text">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
