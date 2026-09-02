# Access Requests: specification

What the app does, how its stores, tools, and screens fit together, and why
each choice was made.

## What this app is

An access-governance demo for a fictional company, Halden Systems. Two
personas use one screen, with no login:

- A **requester** (one employee, Priya Nair in Finance) asks for a role in a
  business system and follows the request until it is granted or denied.
- A **system owner** (the approver) works a queue of reviewed requests,
  reads the agent's recommendation, and decides.

The agent reviews every submitted request against an access policy and
recommends `grant`, `limit`, `escalate`, or `deny`. A human decides. The
agent never provisions access in a real system or gives security,
compliance, or legal advice.

The demo data loads itself the first time the app opens. There is no "load
demo" button.

## Decisions and their reasons

| Decision | Choice | Why |
| --- | --- | --- |
| Personas | One requester and one system owner, switched in the rail, no auth | The runtime gives the custom UI no user identity. A switch keeps the demo self-contained. Every requester would see the same screens, so one is enough. |
| Requester identity | One fixed employee, no picker | A picker over seeded people is a persona per person in disguise. One employee keeps the form honest; other people appear as data in the backlog. |
| What a requester submits | One role from a static catalog, with a window and a justification | One role per request keeps the segregation-of-duties check a pairwise lookup and the entitlement a single row. |
| Catalog | Static code in `catalog.ts`, read-only | Roles, sensitivity, and the pairs are policy data. A runtime edit would let them drift from the hook and the policy text. |
| Review timing | On submit, in the same tool run | The requester sees a result without anyone pressing a button. |
| Lifecycle | The system owner can return a request; the requester edits and resubmits | Gives `limit` a human path, at the cost of one status and one decision value. |
| Grant | Writes an entitlement expiring on the request's end date | The Systems tab and the next review read what a person holds from one store. Nothing is provisioned. |
| History | An `events` store, one row per action, and one review row per run | Re-reviews and returns are kept. Reviews do not overwrite each other. |
| Seed | Six pinned live requests plus a decided backlog with its entitlements, seeded on first open | History, the Systems tab, and the requester's list are populated at first open. The evals keep their six cases. |
| Policy | Read-only in the UI | The guard hook, `policy.ts`, `catalog.ts`, and the reviewer prompt all carry the rules. A runtime edit would let them drift. |
| Escalate | The system owner decides, note required | No security persona. Hard rules still block in code and in the hook. |
| Reset | A `reset_demo` tool behind a confirm modal | Replay the demo without redeploying. |
| Requester visibility | Status, issues on a return, and the system owner's note | Recommendations and check tables stay owner-side. |

## Runtime constraints that shape the design

- **No startup hook.** The runtime's hook points are `preInput`, `preToolUse`,
  `postToolUse`, `preOutput`, and `postTurn`. Trigger kinds are `regex`,
  `invoke`, and `schedule` (cron). Nothing runs at deploy time, so "seed on
  launch" is the UI seeding on first mount when the stores are empty.
- **A run cannot read back its own writes.** `loadRequest` works around this
  for seeding. `submit_request` therefore reviews the row it holds in memory
  instead of re-reading it, and `runRequestReview` accepts a preloaded
  request.
- **The invoke lane.** `useToolRun` posts to `/api/tools/<name>/run` for any
  tool with an `invoke` trigger and `execution: "durable"`; the lane refuses
  a non-durable tool. Durable tools also run from chat: a regex trigger
  executes the handler with the same composite context, which is what the
  `review <id>` and `seed` commands use. A run's result is
  `{ sessionId, outcome, result }`; a thrown handler error resolves with
  `outcome.kind: "failed"` and the message in `outcome.reason`, so the UI
  reads the outcome instead of catching.
- **Store tools** are `store__<name>__get`, `__set`, `__query`, `__list`, and
  `__remove`. `__remove` is registered only for a store whose JSON declares
  `"deletable": true`; all four stores do. Reset uses `__list` and `__remove`.

## Personas and identity

A rail on the left carries the brand, the persona's sections with a count
where one matters (undecided requests on Queue, returned requests on My
requests), the persona switch, and **Reset demo data**.

- **System owner**: one operator. Events record the actor as `approver`.
- **Requester**: one employee, `Priya Nair (Finance)` (`REQUESTER` in
  `catalog.ts`), with her manager from `PEOPLE`. The choice is kept under the
  `localStorage` key `persona` as `{ role }`. Events record her name as the
  actor of a submission.

The chat widget floats on every tab for both personas; the guard hook and
the agent prompt keep chat from granting anything.

## Navigation

Hash routes, no router dependency. Switching persona lands on that persona's
first tab.

| Persona | Route | Screen |
| --- | --- | --- |
| System owner | `#/queue` | Queue: undecided requests with recommendations, actions |
| System owner | `#/systems` | Systems: the catalog, each role's holders and open requests |
| System owner | `#/history` | History: the events timeline, filterable |
| System owner | `#/policy` | Policy: the Markdown and the limits and pairs from code |
| System owner | `#/request/<id>` | Request detail: access held, checks, reviews, events, actions |
| Requester | `#/submit` | New request: the form |
| Requester | `#/mine` | My requests: every request Priya submitted and its status |
| Requester | `#/request/<id>` | Request detail, requester view |

An unknown route or a route the persona does not own redirects to the
persona's first tab.

## Request lifecycle

`status` is the human-owned lane:

```
new -> reviewed -> granted | denied
              \-> returned -> new (resubmitted, revision + 1) -> reviewed -> ...
```

- `new`: submitted, seeded, or resubmitted; no review for this revision yet.
- `reviewed`: a review for the current revision is saved; `recommendation`
  and `review_id` point at it.
- `returned`: the system owner sent it back with a note. The requester can
  edit and resubmit.
- `granted`, `denied`: terminal. A grant also writes an entitlement.

Requester-facing labels: `new` and `reviewed` show as **Under review**,
`returned` as **Returned, action needed**, `granted` and `denied` as
themselves.

Rules the tools enforce:

- Only a `reviewed` request can be decided.
- `returned` requires a note.
- Granting a request whose latest recommendation is `escalate` requires a
  note.
- The hard rules (`grantBlockers`) block a grant in `decide_request` and in
  the `access-guard` hook.
- Only a `returned` request can be resubmitted.

## Policy

The rules the code enforces, in `policy.ts`, `catalog.ts`, and the hook:

| Rule | Value |
| --- | --- |
| Privileged role, per grant | 30 days |
| Standard role, per grant | 365 days |
| Privileged roles | AWS Production Prod Admin, GitHub Org Owner, Okta Admin, Snowflake Account Admin |
| Segregation of duties | Salesforce Deal Desk / Commission Admin; NetSuite AP Clerk / AP Approver; AWS Production Prod Deploy / Change Approver |

Hard rules (never grantable as asked): a segregation-of-duties conflict with
an active entitlement, a role already held, a duplicate of an open request
by the same person for the same role, a window over the limit, an end date
not after the start date, a role the catalog does not have.

Floor: conflict, held, duplicate, or unknown role is never better than
`deny`; a privileged role never better than `escalate`; a window over the
limit never better than `limit`.

## Data model

### `requests`

The request as submitted (`role_id` plus the denormalized `system`, `role`,
`sensitivity`, and `manager`; `justification`, `ticket`, `start_date`,
`end_date`, `notes`), plus the fields the lifecycle owns:

| Field | Type | Meaning |
| --- | --- | --- |
| `requester` | string | The person asking, `Name (Team)`. |
| `revision` | number | 1 on submit, +1 on each resubmit. |
| `status` | enum | `new`, `reviewed`, `granted`, `denied`, `returned`. |
| `review_id` | string, nullable | The review for the current revision. |
| `recommendation` | enum, nullable | The clamped recommendation of that review. |
| `returned_note` | string, nullable | The system owner's note from the latest return. |
| `decision_note` | string, nullable | The system owner's note on the decision. |
| `received_at` | datetime | When the request first arrived. |
| `submitted_at` | datetime | When this revision was submitted. |
| `reviewed_at`, `decided_at` | datetime, nullable | When the review and the decision landed. |

### `entitlements`

Keyed `ent_{slug(person)}_{slug(role_id)}`: `person`, `role_id`, `system`,
`role`, `sensitivity`, `granted_at`, `expires_at`, `source_request_id`
(null for access that predates the demo), `status` (`active` or `expired`).
`decide_request` writes a row on a grant, replacing an expired one for the
same person and role. The review reads a person's rows for conflicts and
held roles; only `active` rows count.

### `reviews`

Keyed `rev_{request_id}_{revision}_{created_at ms}`, so every run keeps its
row. `revision` names the request revision reviewed; the request's
`review_id` names the latest row. `checks` carry four names: `role`,
`segregation`, `duration`, `justification`.

### `events`

| Field | Type | Meaning |
| --- | --- | --- |
| `event_id` | string | `evt_{created_at ms}_{random}` |
| `request_id` | string, nullable | The request the event is about. Null for `reset`. |
| `kind` | enum | `seeded`, `submitted`, `resubmitted`, `reviewed`, `returned`, `granted`, `denied`, `reset` |
| `actor` | string | A requester's name, `approver`, `agent`, or `system` |
| `recommendation` | enum, nullable | On `reviewed`: the clamped recommendation |
| `note` | string, nullable | The operator's note on a decision or return |
| `revision` | number, nullable | The request revision the event belongs to |
| `created_at` | datetime | |

Indexed: `request_id`, `kind`, `actor`, `created_at`.

Every tool that changes a request appends one event in the same run. The
agent's chat surface has this store as `rw`: a session registers store
tools from the agent's grants, and a composite tool's `uses` is checked
against that registry, so the events writes in `review_request` and
`seed_examples` need the write grant. The prompt forbids writing events by
hand.

## Tools

| Tool | Triggers | Lane | What it does |
| --- | --- | --- | --- |
| `seed_examples` | `seed` regex, `invoke` | durable | Loads the demo dataset, entitlements, reviews, and events included. Idempotent per row. |
| `submit_request` | `invoke` | durable | Validates, writes the row, appends the event, reviews the in-memory row. |
| `review_request` | `review <id>` regex, `invoke` | durable | Writes one review row per run, stamps `review_id`, appends `reviewed`. |
| `decide_request` | `invoke` | durable | Records `granted`, `denied`, or `returned` under the note rules. Writes the entitlement on a grant. Appends the event. |
| `reset_demo` | `invoke` | durable | Removes every row in the four stores, then seeds. Appends `reset`. |
| `access_math` | | | Days requested, the limit, and the overrun for the reviewer and the chat agent. Numbers only. |

### `submit_request`

Parameters:

```json
{
  "request_id": "optional; present means a resubmission",
  "role_id": "a catalog role id",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD, after start_date",
  "justification": "string",
  "ticket": "string or null",
  "notes": "string or null",
  "requester": "a person in PEOPLE"
}
```

Behavior:

1. Validate. Every string trimmed and non-empty where required, dates ISO
   with the end after the start, the role in the catalog, the requester in
   `PEOPLE`. The window is not capped: the policy's duration rule needs to
   be demonstrable.
2. New submission: `request_id` is `req_{slug(requester)}_{slug(role_id)}`.
   If that key exists, append `_2`, `_3`, and so on. This keeps a resent
   request as its own row, which is what the duplicate check needs.
3. Resubmission: the row must exist and be `returned`. Fields are replaced
   (the role can change), `revision` increments, `status` becomes `new`,
   `returned_note` clears.
4. Write the row with `status: new`, the denormalized role fields and the
   manager, `submitted_at` and `received_at` set to now (resubmission keeps
   the original `received_at`).
5. Append `submitted` or `resubmitted`, actor the requester.
6. Run the review on the in-memory row, with the requester's entitlements
   and other requests read from the stores.
7. Return `{ request_id, revision, recommendation, review_id }`. A failing
   review leaves the request `new` and rethrows.

### `review_request`

`runRequestReview` takes an optional preloaded `{ request, held, others }`.
Without one it loads from the stores, which is the path the chat trigger and
the evals take, including the self-seeding fallback on fresh stores. On
completion it writes the review row, re-emits the request with
`status: reviewed`, `review_id`, `recommendation`, `reviewed_at`, and appends
a `reviewed` event with actor `agent`.

### `decide_request`

`decision` is `granted`, `denied`, or `returned`. Requires `status:
reviewed` and a review at `request.review_id`.

- `returned`: note required. Sets `status: returned`, `returned_note`,
  `decided_at: null`. Appends `returned`.
- `granted`: blocked by `grantBlockers`. Note required when the review's
  recommendation is `escalate`. Writes the entitlement with `expires_at`
  equal to the request's end date. Appends `granted`.
- `denied`: appends `denied`.

Actor is `approver`.

### `reset_demo`

Lists and removes every row in `entitlements`, `requests`, `reviews`, and
`events`, then calls `ensureExamplesSeeded`. Appends one `reset` event with
actor `system` after the seed. Not in any agent's tools.

### Agent surfaces

- `agents/default/agent.json`: tools `review_request`, `seed_examples`, and
  `access_math`; all four stores as `rw`.
- `agents/default/AGENT.md`: the data loads on first open, history questions
  are answered from the events store, the requester persona is named.
- `agents/access-reviewer`: the policy judgment, called as a subagent.
- `hooks/access-guard`: reads the person's entitlements from the stores and
  blocks a grant write that conflicts with one, or a request write whose
  window is over the limit.

## Seed dataset

`amodal/_lib/examples.ts` holds six live requests:

| Request | Requester | Role |
| --- | --- | --- |
| `req_tom_github_developer`, `req_tom_github_developer_again` | Tom Becker (Engineering) | GitHub Developer |
| `req_priya_netsuite_ap_approver` | Priya Nair (Finance) | NetSuite AP Approver |
| `req_tom_aws_prod_admin` | Tom Becker (Engineering) | AWS Production Prod Admin |
| `req_sofia_workday_hr_read` | Sofia Ruiz (Sales) | Workday HR Read |
| `req_sofia_snowflake_analyst` | Sofia Ruiz (Sales) | Snowflake Analyst |

It also holds a **backlog**: ten requests dated over the eight months before
the live set, each already reviewed and decided, with their review rows,
events, and (for grants) entitlements, plus three baseline entitlements with
no request behind them. Shape:

- Seven `granted` requests across six people, one of them returned and
  granted at revision 2 with a different role (two reviews, six events).
- One privileged grant with a security sign-off note.
- One `denied` segregation-of-duties conflict, with a note.
- One `denied` after an `escalate` recommendation, with a note.

Constraints, each pinned by a test in `tests/demo-data.test.ts`:

- Every request names a person in `PEOPLE` and a role in the catalog, with
  the end date after the start date.
- No live request asks for a role its requester already holds. The six
  review evals keep passing untouched.
- Every granted backlog request has one entitlement keyed from it, expiring
  on its end date; every sourced entitlement points back at a granted
  request.
- Entitlement status follows `DEMO_NOW`.
- No person holds both roles of a pair, and every granted window is within
  the limit, so every seeded grant passes the guard hook.
- Every backlog request has at least one review and at least three events
  (submitted, reviewed, decided), with timestamps in that order.
- Seeded review rows are canned (`reviewer_session_id: "seed"`), written by
  code, never by the model.

`ensureExamplesSeeded` writes entitlements first (the guard hook reads them
when a granted request is written), then requests, reviews, and events,
idempotent per row, and returns how many requests it wrote.

## Seeding on first open

In `App.tsx`, once the `requests` query has loaded and returned no rows, the
app runs `seed_examples` through `useToolRun` and refetches. A ref prevents a
second run under StrictMode; the tool is idempotent regardless. While it
runs the page shows "Loading the demo…" in place of the tables. A failure
shows a banner with a Retry button.

## Screens

### System owner: Queue

The requests whose status is `new`, `reviewed`, or `returned`, sorted by
`received_at` descending. Columns: requester with request id, ticket, and
notes; role with system, sensitivity pill, and the justification clamped to
two lines; window with the day count; recommendation pill with the duration
note; issues; actions.

Actions per row: **Review** (or Re-review), and on a `reviewed` row
**Grant**, **Return**, **Deny**. Each opens the confirm modal. **Review all**
in the header reviews every `new` row. Reviews queue and run one at a time.

### System owner: Request detail

Header: role, requester, day count, revision, status pill. Sections:

- **Request**: role with purpose, window, requester with manager, ticket,
  justification, notes, and the active roles the requester holds.
- **Latest review**: recommendation, summary, the four checks with status
  and note, issues.
- **Actions**: the same buttons as the queue row, replaced by the decision
  note once decided.
- **Timeline**: this request's events, newest first. Each review expands
  inline.

### System owner: Systems

One row per catalog role: system and role with the sensitivity pill and the
id, purpose, the roles it conflicts with, the active holders with their
expiry, and the open requests for it (linked).

### System owner: History

The events store, newest first, with filter chips by kind (All, Submitted,
Reviewed, Returned, Granted, Denied, System) and a text filter on person,
role, or request id.

### System owner: Policy

`access-policy.md` rendered with `FormattedMarkdown`, preceded by a table
read from `policy.ts` and `catalog.ts` (the two limits, the privileged
roles, the pairs) so the page cannot disagree with the code.

### Requester: New request

A form: role (a select grouped by system, privileged roles marked), a hint
with the role's purpose and its limit, start date, end date, justification,
ticket, notes. The requester and manager are shown, not chosen, with the
roles currently held.

Submit runs `submit_request`, holds the button at "Submitting and
reviewing…" while the review runs, then navigates to the request detail.

### Requester: My requests

Priya's requests, newest first: role with sensitivity, window, submitted
date, status label. A `returned` row shows the note and an **Edit and
resubmit** button.

### Requester: Request detail

The same request section as the system owner's, with the status label
instead of the recommendation. On `returned`: the note and the latest
review's issues, and the form prefilled for resubmission. On `granted` or
`denied`: the note. No checks, no recommendation, no timeline.

### Modals

- **Decide**: one modal for the three decisions, with the note required for
  `returned` and for granting an `escalate`. The copy says what the decision
  records and that nothing is provisioned.
- **Reset demo data**: "This deletes every request, entitlement, review,
  and event and reloads the demo. Continue?"

## Code layout

```
amodal/
  stores/        requests.json  entitlements.json  reviews.json  events.json
  _types/
    tool-context.ts         the runtime's tool context and definition types
  _lib/
    catalog.ts              systems, roles, pairs, people, the requester persona, key helpers
    policy.ts               the duration limits and the arithmetic
    access-review.ts        facts, the subagent call, the clamp, the review row, the reviewed event
    submit.ts               validation, id generation, submit and resubmit
    events.ts               appendEvent and the kind enum
    reset.ts                empty the four stores, reseed blind, record the reset
    examples.ts             the live set, the decided backlog, the baseline entitlements
    demo-data.ts            row builders and the idempotent seed over the four stores
  tools/
    review_request/  seed_examples/  submit_request/  decide_request/  reset_demo/  access-math/
src/
  main.tsx
  App.tsx                   shell: rail, persona, routes, auto-seed, reset
  routes.ts                 hash router hook and the per-persona route table
  persona.ts                localStorage persona
  tools.ts                  invoke-lane runner that rethrows a failed outcome
  serial.ts                 one-at-a-time task queue
  actions.tsx               the system owner's review and decide actions, with the modal
  types.ts                  row types and formatting shared by the screens
  screens/
    Queue.tsx  RequestDetail.tsx  Systems.tsx  History.tsx  Policy.tsx
    Submit.tsx  MyRequests.tsx
  components/
    RequestTable.tsx  RequestActions.tsx  StatusPill.tsx  DecideModal.tsx  ConfirmModal.tsx
    Timeline.tsx  ReviewBody.tsx  Sidebar.tsx
  styles.css
tests/
  policy.test.ts  catalog.test.ts  access-review.test.ts  decide-request.test.ts  demo-data.test.ts
  submit.test.ts  events.test.ts  reset-demo.test.ts  routes.test.ts  review-request-handler.test.ts
  types.test.ts  serial.test.ts  access-guard.test.mjs
  helpers.ts                the in-memory store fake, and asserts a handler's store calls and its tool.json uses match each other
```

## Tests and evals

Unit tests, `npm test`:

- `policy.test.ts`: day counts, the limit per sensitivity, the overrun,
  invalid dates.
- `catalog.test.ts`: unique ids, symmetric pairs, the hook config mirrors
  the catalog and the policy.
- `submit.test.ts`: validation errors, id generation and collision suffix,
  the requester's access reaches the review, resubmit requires `returned`,
  revision increments, the review runs on the in-memory row.
- `decide-request.test.ts`: a grant writes the entitlement, a re-grant
  replaces the expired row, `returned` without a note fails, granting an
  `escalate` without a note fails, the hard rules refuse a grant, each
  decision appends exactly one event.
- `access-review.test.ts`: the duplicate rule, the floor and the blockers
  per fact, an expired role neither conflicts nor counts as held, two
  reviews of the same request produce two rows, the event carries the
  clamped recommendation, a preloaded request reads no store.
- `review-request-handler.test.ts`: the composite context reaches the review
  flow, and the fresh-store seed uses only declared tools.
- `events.test.ts`: `eventRow` is deterministic for a time and suffix, and
  `appendEvent` writes one row with the nulls filled.
- `demo-data.test.ts`: the invariants listed under Seed dataset, and that
  seeding twice writes nothing the second time.
- `reset-demo.test.ts`: every store is emptied before the seed, one `reset`
  event.
- `routes.test.ts`: persona ownership of routes and the redirect.
- `serial.test.ts`: queued tasks run in order without overlapping.
- `types.test.ts`: `windowDays` and `activeAccess`.
- `access-guard.test.mjs`: the hook blocks a segregation-of-duties conflict
  on the request, the review, and the entitlement write, blocks a window
  over the limit for its sensitivity, and ignores other tools, other
  points, and non-grant writes.

Evals, `amodal eval`:

- The six `review-*` evals, `seed-demo-data`, and `never-grants`.
- `history-question.md`: "what happened to Sofia's request?"; asserts the
  answer comes from the store.
- `never-decides.md`: asking the chat to return a request gets a refusal
  that points at the system owner's screen.

Verification before each commit: `npm run typecheck`, `npm test`, and
`amodal eval` for any change under `agents/`, `amodal/tools/`, or
`amodal/knowledge/`.

## Out of scope

Provisioning in a real system, real authentication, editing the catalog or
the policy at runtime, access reviews and recertification, automatic expiry
and revocation, a separate manager approval step, and a security persona.
