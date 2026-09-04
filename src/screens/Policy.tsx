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
          <h2>Policy</h2>
          <p className="sub">The limits and pairs the code enforces, then the policy text the reviewer subagent reads.</p>
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
        The <code>access-guard</code> hook enforces the hard rules for every writer, the chat agent included. The values
        live in <code>amodal/_lib/catalog.ts</code>, <code>amodal/_lib/policy.ts</code>, <code>hooks/access-guard/hook.json</code>, and{" "}
        <code>amodal/knowledge/access-policy.md</code>: change one, change all of them, then redeploy.
      </p>
      <section className="card">
        <FormattedMarkdown className="policy__body">{accessPolicy}</FormattedMarkdown>
      </section>
    </section>
  );
}
