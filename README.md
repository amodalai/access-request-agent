# Access Request Example

An Amodal agent that reviews IT access requests before a system owner
decides, in a two-persona access-governance demo for a fictional company,
Halden Systems. An employee requests a role; the agent checks the
segregation-of-duties matrix, the requester's existing entitlements, and the
duration limit in code, has a reviewer subagent apply the access policy, and
recommends one of `grant`, `limit`, `escalate`, or `deny`; a system owner
works the queue and decides, or returns the request for a fix. Every action
leaves an event, and a guard hook makes the policy's hard rules hold for
every writer.

The agent logic runs on the Amodal runtime, and the UI is a small React app
the runtime serves for you. This repo is a finished, deliberately small app
meant to be copied and changed. It has the same shape as
[invoice-approval-agent](https://github.com/amodalai/invoice-approval-agent)
on a different domain. For the same building blocks introduced one at a
time, see [amodal-demo](https://github.com/amodalai/amodal-demo).

> Fictional demo. The agent recommends a decision only. It never provisions
> access in a real system or gives security, compliance, or legal advice.

## The use case

An employee asks for a role in a business system. Before a system owner
grants it, someone has to answer: is this a role we hand out, does the
person already hold something that must not be combined with it, is the
window within what the policy allows, and does the stated reason fit what
the role is for? The first three questions are lookups and arithmetic. The
last one is judgment. This app splits the work the same way:

| Question                                              | Who answers                | Where                                    |
| ----------------------------------------------------- | -------------------------- | ---------------------------------------- |
| Request a role                                        | An employee, from the UI   | `amodal/tools/submit_request/handler.ts` |
| Is the role in the catalog, and how sensitive is it?  | Code                       | `amodal/_lib/catalog.ts`                 |
| Does it conflict with a role the person holds?        | Code                       | `amodal/_lib/access-review.ts`           |
| Is this a duplicate, or already held?                 | Code                       | `amodal/_lib/access-review.ts`           |
| Is the window within the limit?                       | Code (`access_math`)       | `amodal/_lib/policy.ts`                  |
| Does the justification fit the role's purpose?        | The reviewer subagent      | `agents/access-reviewer/AGENT.md`        |
| Would a narrower role do? Is a ticket cited?          | The reviewer subagent      | `amodal/knowledge/access-policy.md`      |
| Grant, return, or deny?                               | A human, from the UI       | `amodal/tools/decide_request/handler.ts` |

## How it works

Two personas share one screen, switched in the left rail with no login: the
**system owner** (the approver) and the **requester**, one employee, Priya
Nair (Finance). The choice is kept in `localStorage`. Her manager is stamped
on each request from the people table in `catalog.ts`.

The UI calls its tools through the direct-invoke lane (`useToolRun` posts to
`/api/tools/<name>/run`). A tool on that lane declares `execution: "durable"`
and an `{ "kind": "invoke" }` trigger in its `tool.json`:

- [`seed_examples`](amodal/tools/seed_examples/tool.json) loads the demo
  dataset. The app runs it the first time it opens on empty stores; the
  `seed` chat command runs the same tool, idempotent per row.
- [`submit_request`](amodal/tools/submit_request/tool.json) validates the
  form, writes the request, appends a `submitted` event, and reviews the row
  it holds in memory, all in one run.
- [`review_request`](amodal/tools/review_request/tool.json) runs the review
  from the system owner's Review button, and from the `review <id>` chat
  command (a regex trigger fires it from the request path before the LLM,
  which then reports the result). As it works it narrates each step into the
  chat's reasoning block (`ctx.emitReasoning`).
- [`decide_request`](amodal/tools/decide_request/tool.json) records the
  system owner's decision: `granted`, `denied`, or `returned` with a note.
- [`reset_demo`](amodal/tools/reset_demo/tool.json) empties the four stores
  and seeds them again, from the rail.

`review_request` runs the four-stage flow in
[`runRequestReview`](amodal/_lib/access-review.ts). The tool declares
everything it composes in `uses` (the store tools and the reviewer subagent);
undeclared calls fail closed:

1. **load**: reads the request, the requester's entitlements, and the
   requester's other requests from the stores via the auto-generated
   `store__*__get` / `store__*__query` tools, or takes the rows the caller
   already holds (`submit_request` cannot read back the row it just wrote).
2. **check (in code)**: the catalog lookup, the segregation-of-duties
   conflicts against the roles held, whether the role is already held, the
   duplicate lookup (same person and role, an earlier request still open),
   and the window against the limit for the role's sensitivity. Rules, not
   judgments, so code decides them and hands the reviewer the result as
   fact.
3. **review (in the subagent)**: `ctx.callSubagent` runs the
   [`access-reviewer`](agents/access-reviewer/AGENT.md), which applies the
   [access policy](amodal/knowledge/access-policy.md) (passed in as input)
   and makes the judgment a formula can't: does the justification fit the
   role's purpose, would a narrower role do, does a privileged request cite
   a ticket. Mid-review it calls the
   [`access_math`](amodal/tools/access-math/tool.ts) custom tool for the
   arithmetic (days requested, the limit, the overrun) and must cite those
   numbers in its `duration` check. Its reply is a single JSON object the
   flow parses.
4. **record**: code holds the floor on the way out. It computes the least
   conservative recommendation the facts allow (a conflict, a duplicate, or
   a held role is never better than `deny`, a privileged role never better
   than `escalate`, a window over the limit never better than `limit`) and
   clamps the reviewer's call to it. Then it writes a `reviews` row for this
   run (keyed `rev_{request_id}_{revision}_{ms}`, so a re-review keeps the
   earlier one), stamps the request `reviewed` with the review's id, and
   appends a `reviewed` event.

The request's `status` is the human-owned lane:

```
new -> reviewed -> granted | denied
              \-> returned -> new (resubmitted, revision + 1) -> reviewed -> ...
```

**Grant**, **Return**, and **Deny** open a confirm modal, then call
`decide_request`. It requires a reviewed request and its review, re-runs the
hard rules before a grant and refuses when one fails, requires a note to
return a request or to grant one the review escalated, writes the
entitlement a grant creates (expiring on the request's end date), and
appends the event. A returned request goes back to its requester, who edits
and resubmits it at the next revision. `decide_request`, `submit_request`,
and `reset_demo` are in no agent's `tools` list, so the model cannot call
them.

The `events` store holds one row per action (`seeded`, `submitted`,
`resubmitted`, `reviewed`, `returned`, `granted`, `denied`, `reset`) with
its actor. The History tab and each request's timeline render it, and the
chat agent answers "what happened to Sofia's request?" from it.

The [`access-guard`](hooks/access-guard/index.mjs) hook backstops the hard
rules at the platform layer: any write of `status: granted` or
`recommendation: grant` on a request, `recommendation: grant` on a review,
or an active entitlement is blocked when the role conflicts with one the
person already holds, or (for a request) when the window is over the limit
for the role's sensitivity. The handlers already enforce this in code; the
hook makes it true for every writer, including the chat agent's store tools.

## What's in here

| Path                                        | What it is                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `amodal.json`                               | Manifest: `runtimeApp: { custom: true }`, memory off.                                                   |
| `agents/default/`                           | The chat agent: `AGENT.md` (prompt) and `agent.json` (tools, stores).                                   |
| `agents/access-reviewer/`                   | The reviewer subagent that applies the access policy. Its `agent.json` grants `access_math` + `load_knowledge`. |
| `amodal/knowledge/access-policy.md`         | The fictional access policy the reviewer reasons over (passed to it as input).                          |
| `amodal/stores/`                            | 4 store schemas: `requests`, `entitlements`, `reviews`, `events`.                                       |
| `amodal/_lib/catalog.ts`                    | The systems and roles, the segregation-of-duties pairs, the people, and the requester persona.          |
| `amodal/_lib/policy.ts`                     | The duration limits and the arithmetic, one implementation for the tool, the flow, and the tests.       |
| `amodal/_lib/access-review.ts`              | The shared review flow: load, check, delegate, clamp, record.                                          |
| `amodal/_lib/submit.ts`                     | The submission: validation, id generation, the resubmit rules, then the review.                        |
| `amodal/_lib/events.ts`                     | The `appendEvent` helper and the event kinds.                                                          |
| `amodal/_lib/reset.ts`                      | Empty the four stores, seed them again, record the reset.                                              |
| `amodal/_lib/examples.ts` / `demo-data.ts`  | The demo dataset (six live requests, a decided backlog with its reviews, events, and entitlements, and the baseline entitlements) and the code that hydrates it into the four stores. |
| `amodal/tools/review_request/`              | The durable review tool (`tool.json` + `handler.ts`): declares its `uses`, the `review` regex trigger, and the `invoke` trigger. |
| `amodal/tools/seed_examples/`               | The seeding tool behind the `seed` trigger and the app's first open.                                   |
| `amodal/tools/submit_request/`              | Invoke-lane tool behind the requester's New request form.                                              |
| `amodal/tools/decide_request/`              | Invoke-lane tool behind Grant / Return / Deny: the system owner's decision, recorded.                   |
| `amodal/tools/reset_demo/`                  | Invoke-lane tool behind Reset demo data.                                                               |
| `amodal/tools/access-math/`                 | The custom tool the reviewer calls: deterministic arithmetic, numbers never verdicts.                   |
| `amodal/_types/tool-context.ts`             | Vendored runtime types (`CustomToolContext`, `ToolDefinition`), kept local so the example typechecks offline. |
| `hooks/access-guard/`                       | `preToolUse` guard enforcing the hard rules for every writer.                                           |
| `evals/`                                    | The eval suite: one per live request, a seed smoke test, a history question, and two safety evals. Re-run it before promoting. |
| `src/`                                      | The custom React UI (Vite): `App.tsx` (rail, persona, hash routes, auto-seed), `routes.ts`, `persona.ts`, `types.ts`, `screens/` (Queue, RequestDetail, Systems, History, Policy, Submit, MyRequests), and `components/`. |
| `tests/`                                    | Unit tests for the code paths (`npm test`). Kept out of `amodal/` and `hooks/` so the runtime's loaders never see them. |

## Example cases

The six live requests in `examples.ts`, each pinned by an eval:

| Request                          | Role                        | Why                                                                 | Expected   | Eval                       |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------- | ---------- | -------------------------- |
| `req_tom_github_developer`       | GitHub Developer            | Standard role, no conflict, 364 days, onboarding ticket             | `grant`    | `review-clean-grant.md`    |
| `req_priya_netsuite_ap_approver` | NetSuite AP Approver        | Priya holds AP Clerk: the pair is a segregation-of-duties conflict  | `deny`     | `review-sod-conflict.md`   |
| `req_tom_aws_prod_admin`         | AWS Production Prod Admin   | Privileged, 14 days, incident ticket: in order, still needs sign-off | `escalate` | `review-privileged.md`     |
| `req_sofia_workday_hr_read`      | Workday HR Read             | Every number is fine; an org chart does not need compensation data  | `limit`    | `review-scope-mismatch.md` |
| `req_sofia_snowflake_analyst`    | Snowflake Analyst           | 425 days against a 365-day limit                                    | `limit`    | `review-over-duration.md`  |
| `req_tom_github_developer_again` | GitHub Developer            | Same person and role as the first request, still open               | `deny`     | `review-duplicate.md`      |

Sofia's two requests show the split. The Snowflake one is arithmetic: the
tool says 60 days over and code would clamp any softer call. The Workday one
is judgment: every number is fine, and only a reader of the role's purpose
("worker records, including compensation and personal data") can see that
an org chart for territory planning does not need it.

Behind them sits a backlog of ten decided requests from the eight months
before, with the entitlements they granted, canned reviews, and events:
routine grants across six people, a denied segregation-of-duties conflict
(Ravi asking for Prod Deploy while holding Change Approver), one returned
and granted on its second revision (Priya asking for Snowflake Account Admin,
resubmitted as Analyst), one privileged grant with a security sign-off note
(Ravi's seven-day Okta Admin, expired since), and one escalated and denied
with a note (Tom's GitHub Org Owner). Three baseline entitlements predate the
backlog. They fill the History tab, the Systems tab, and the requester's
list at first open.

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's
domain and the agent chat alongside it. No credentials or environment
variables are needed.

1. Open the app. It loads the demo dataset on its own the first time
   ("Loading the demo…"), then shows the system owner's **Queue** with the
   six live requests.
2. Click **Review** on a row, or **Review all**. The recommendation, the
   duration note (the `access_math` numbers, cited by the reviewer), and the
   issues appear inline. Click a requester to open the request: what they
   already hold, the checks, the review, and the timeline.
3. **Grant** Tom's GitHub Developer request and confirm. Tom appears as a
   holder on the **Systems** tab. Review `req_tom_github_developer_again`:
   it is a duplicate of a request that is now decided, so the duplicate
   rule no longer applies, and Tom already holds the role instead.
4. **Grant** Priya's AP Approver request and confirm. The decision is
   refused: the role conflicts with the AP Clerk role she holds. That is
   the hard rule in `decide_request`; the `access-guard` hook enforces the
   same rule for any other writer. **Return** it instead, with a note.
5. Switch the persona to **Priya Nair (Finance)**. **My requests** shows the
   returned request with your note; **Edit and resubmit** opens the form
   prefilled. Change the role to NetSuite GL Read, resubmit, and watch the
   review run. Switch back to the system owner: the queue shows revision 2,
   ready to grant.
6. Still as Priya, submit a new request from **New request**. Ask for a
   privileged role, or a window over a year, to demonstrate the limits.
   The review runs on submit and lands on the request's page.
7. Ask the chat: `what happened to Sofia's request?`, `who holds Prod
   Admin?`, or `would 45 days be within the limit for Okta Admin?`. It
   answers from the events store, the other stores, and `access_math`,
   never by counting in its head. Ask it to grant or return something and
   it points you at the queue.
8. **Reset demo data** at the bottom of the rail puts everything back.
9. Open the agent's **Evals** page and run the suite: ten green checks.
   Then edit `access-policy.md`, drop the standard limit to 180 days,
   redeploy, and re-run: `review-clean-grant` fails while the rest stay
   green.

### Developing locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks the runtime code (amodal/, tests/) and the SPA (src/)
npm test           # unit tests for the policy math, the catalog, the review flow, submit, decide, reset, the seed, the routes, and the hook
amodal eval        # the eval suite against a local runtime
```

## Making it yours

The pieces, in the order most people change them:

- **The catalog**: `amodal/_lib/catalog.ts` holds the systems, the roles
  with their sensitivity and purpose, the segregation-of-duties pairs, and
  the people. The privileged roles and the pairs are duplicated in
  `hooks/access-guard/hook.json` and described in
  `amodal/knowledge/access-policy.md`; `tests/catalog.test.ts` pins the
  hook's copy against the catalog.
- **The policy**: `amodal/knowledge/access-policy.md` is the text the
  reviewer reasons over. Its limits are duplicated in
  `amodal/_lib/policy.ts` (`POLICY`, used by the tool, the clamp, and the
  Policy tab) and in `hooks/access-guard/hook.json` (`config`, used by the
  guard). Change one, change all three; `npm test` pins the code copies.
- **The dataset**: `amodal/_lib/examples.ts`. Each request is one
  self-contained entry naming a person and a `role_id`; backlog requests
  carry their canned reviews and final decision, and a granted one seeds
  the entitlement. `tests/demo-data.test.ts` pins the invariants (every
  grant has its entitlement, no person holds a conflicting pair, every
  seeded grant passes the guard). Edit it, redeploy, and update the evals
  that pin the expected recommendations.
- **The judgment**: `agents/access-reviewer/AGENT.md` holds the check
  categories, the recommendation rules, and the JSON shape. Add a check by
  adding it there and in the `reviews` store's `_comment_purpose`.
- **The hard rules**: `grantBlockers` and `floorRecommendation` in
  `amodal/_lib/access-review.ts` are the rules code enforces regardless of
  what the model says. `decide_request` and the review flow both call them.
  Mirror a new rule in `hooks/access-guard/index.mjs` if it should hold for
  every writer.
- **The arithmetic**: `accessMath` in `amodal/_lib/policy.ts`. The tool in
  `amodal/tools/access-math/tool.ts` exposes it to the reviewer; its
  `description` and `parametersJsonSchema` are what the LLM sees.
- **The stores**: `amodal/stores/*.json`. The runtime validates every write
  against the schema, so a new field goes there first, then through
  `examples.ts`, `demo-data.ts`, the row types in `access-review.ts`, and
  `src/types.ts`. A store needs `"deletable": true` for `store__*__remove`.
- **The UI**: `src/App.tsx` is the shell (rail, persona switch, hash routes
  from `routes.ts`, the self-seed on first open, the reset modal); each tab
  is a file under `src/screens/`. Reads go through `useStoreQuery`; every
  write goes through `useToolRun` and `runTool` in `src/tools.ts`, which
  turns a failed run outcome into an error the screen shows. The Policy tab
  imports `access-policy.md` with Vite's `?raw`, so it can never drift from
  what the reviewer reads.
- **The chat agent**: `agents/default/AGENT.md` and `agent.json`. The prompt
  lists the demo ids, the requester persona, and the rules about what chat
  may never do. Store grants are per agent: `rw` registers the store's
  `set` and `remove` tools for the session, and a composite tool the agent
  runs can only call what is registered.
- **Evals**: `evals/*.md`. Deterministic lines (`contains:`) for the
  recommendation string, `Should …` lines for the reasoning.

Not in this template, by choice: provisioning in a real system, real
authentication or an identity provider, editing the catalog or the policy
at runtime, access reviews or recertification campaigns, automatic
expiry and revocation, manager approval as a separate step, a security
persona, an inbound connection (a ticketing system or an IdP), a scheduled
automation, agent memory, and per-tenant scopes.
