import { FormattedMarkdown } from "@amodalai/react";
import accessPolicy from "../../amodal/knowledge/access-policy.md?raw";
import { PRIVILEGED_ROLE_IDS, SOD_PAIRS, roleOf } from "../../amodal/_lib/catalog.js";
import { POLICY } from "../../amodal/_lib/policy.js";
import { roleLabel } from "../types.js";

const label = (id: string) => roleLabel(roleOf(id)!);

export function Policy() {
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h1>Policy</h1>
          <p className="sub">The access limits and the policy the agent uses to review each request.</p>
        </div>
      </div>
      <section className="card">
        <dl className="fields">
          <dt>Privileged role, per grant</dt>
          <dd>{POLICY.privileged_max_days} days</dd>
          <dt>Standard role, per grant</dt>
          <dd>{POLICY.standard_max_days} days</dd>
          <dt>Privileged roles</dt>
          <dd>{PRIVILEGED_ROLE_IDS.map(label).join(", ")}</dd>
          <dt>Segregation of duties</dt>
          <dd>{SOD_PAIRS.map(([a, b]) => `${label(a)} / ${label(b)}`).join("; ")}</dd>
        </dl>
      </section>
      <p className="sub">
        Requests that conflict with existing access or exceed the duration limit cannot be granted.
        Privileged roles need security sign-off.
      </p>
      <section className="card">
        <FormattedMarkdown className="policy__body">{accessPolicy}</FormattedMarkdown>
      </section>
    </section>
  );
}
