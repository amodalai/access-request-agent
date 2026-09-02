import type { Check, Recommendation } from "./access-review.js";

const PRIYA = "Priya Nair (Finance)";
const TOM = "Tom Becker (Engineering)";
const SOFIA = "Sofia Ruiz (Sales)";
const DANA = "Dana Whitfield (Finance)";
const RAVI = "Ravi Menon (Engineering)";
const MARCUS = "Marcus Lee (Sales)";

export interface ExampleRequest {
  request_id: string;
  requester: string;
  role_id: string;
  justification: string;
  ticket?: string;
  start_date: string;
  end_date: string;
  notes?: string;
  /** Order of arrival; the seeder turns it into `received_at`. */
  received_offset_days: number;
}

export interface CannedReview {
  recommendation: Recommendation;
  summary: string;
  checks: Check[];
  issues: string[];
}

/**
 * A backlog request: already reviewed and decided when seeded. One canned
 * review per revision; two reviews mean the first was returned and the
 * request resubmitted (the row holds the final revision's fields).
 */
export interface BacklogRequest extends ExampleRequest {
  reviews: CannedReview[];
  returned_note?: string;
  decided: "granted" | "denied";
  decision_note?: string;
}

/** Access granted before the backlog starts, with no request behind it. */
export interface ExampleEntitlement {
  person: string;
  role_id: string;
  granted_at: string;
  expires_at: string;
}

export const REQUESTS: ExampleRequest[] = [
  {
    request_id: "req_tom_github_developer",
    requester: TOM,
    role_id: "github.developer",
    justification: "Moving to the platform team; I need to push to the monorepo and open pull requests.",
    ticket: "ONB-4471",
    start_date: "2026-09-01",
    end_date: "2027-08-31",
    received_offset_days: 0,
  },
  {
    request_id: "req_priya_netsuite_ap_approver",
    requester: PRIYA,
    role_id: "netsuite.ap_approver",
    justification: "Covering approvals while Dana is on leave in Q4; I need to approve vendor bills and release the payment batch.",
    start_date: "2026-09-01",
    end_date: "2026-12-31",
    notes: "Dana asked me to cover.",
    received_offset_days: 1,
  },
  {
    request_id: "req_tom_aws_prod_admin",
    requester: TOM,
    role_id: "aws.prod_admin",
    justification: "Rotate the IAM roles flagged in the INC-2291 post-mortem and remove the legacy deploy user.",
    ticket: "INC-2291",
    start_date: "2026-09-02",
    end_date: "2026-09-16",
    received_offset_days: 2,
  },
  {
    request_id: "req_sofia_workday_hr_read",
    requester: SOFIA,
    role_id: "workday.hr_read",
    justification: "I need the org chart to plan Q4 territories for the mid-market team.",
    start_date: "2026-09-01",
    end_date: "2026-11-30",
    received_offset_days: 3,
  },
  {
    request_id: "req_sofia_snowflake_analyst",
    requester: SOFIA,
    role_id: "snowflake.analyst",
    justification: "Build the sales pipeline dashboards for the mid-market team.",
    start_date: "2026-09-01",
    end_date: "2027-10-31",
    received_offset_days: 4,
  },
  {
    request_id: "req_tom_github_developer_again",
    requester: TOM,
    role_id: "github.developer",
    justification: "Moving to the platform team; I need to push to the monorepo and open pull requests.",
    ticket: "ONB-4471",
    start_date: "2026-09-01",
    end_date: "2027-08-31",
    notes: "Re-sending, my first request seems stuck.",
    received_offset_days: 5,
  },
];

/** Roles held before the backlog starts, so the segregation-of-duties matrix has something to bite on. */
export const BASELINE_ENTITLEMENTS: ExampleEntitlement[] = [
  { person: RAVI, role_id: "aws.change_approver", granted_at: "2025-11-01", expires_at: "2026-10-31" },
  { person: RAVI, role_id: "github.developer", granted_at: "2025-11-01", expires_at: "2026-10-31" },
  { person: DANA, role_id: "netsuite.gl_read", granted_at: "2026-01-10", expires_at: "2027-01-09" },
];

const CHECKS = ["role", "segregation", "duration", "justification"] as const;

function canned(
  recommendation: Recommendation,
  summary: string,
  notes: [string, string, string, string],
  issues: string[] = [],
  statuses: Partial<Record<(typeof CHECKS)[number], Check["status"]>> = {},
): CannedReview {
  return {
    recommendation,
    summary,
    checks: CHECKS.map((name, i) => ({ name, status: statuses[name] ?? "pass", note: notes[i] })),
    issues,
  };
}

const noConflict = "None of the roles the requester holds conflicts with this one.";
const within = (days: number, max: number, sensitivity: string) =>
  `${days} days requested against the ${max}-day limit for ${sensitivity} roles: within the limit`;

/**
 * Decided requests from the eight months before the live set, seeded with
 * their reviews, events, and the entitlements they granted, so history, the
 * Systems tab, and the requester's list are populated at first open.
 */
export const BACKLOG: BacklogRequest[] = [
  {
    request_id: "req_priya_netsuite_ap_clerk",
    requester: PRIYA,
    role_id: "netsuite.ap_clerk",
    justification: "Joining the AP team; I enter vendor bills and prepare the weekly payment batch.",
    ticket: "ONB-3102",
    start_date: "2026-01-15",
    end_date: "2026-12-31",
    received_offset_days: -230,
    reviews: [
      canned("grant", "A standard NetSuite role for a new AP team member. No conflicting access, within the limit, and the justification matches what AP Clerk is for.", [
        "NetSuite AP Clerk is a standard role: enter vendor bills and prepare payment batches.",
        noConflict,
        within(350, 365, "standard"),
        "Entering bills and preparing the payment batch is the AP Clerk role's purpose; the onboarding ticket is cited.",
      ]),
    ],
    decided: "granted",
  },
  {
    request_id: "req_dana_netsuite_ap_approver",
    requester: DANA,
    role_id: "netsuite.ap_approver",
    justification: "I approve vendor bills and release payment batches as the AP lead.",
    ticket: "ONB-3090",
    start_date: "2026-01-10",
    end_date: "2027-01-09",
    received_offset_days: -215,
    reviews: [
      canned("grant", "The AP lead asking for the approver role. No conflicting access (GL Read is read-only), within the limit, justification on point.", [
        "NetSuite AP Approver is a standard role: approve vendor bills and release payment batches.",
        noConflict,
        within(364, 365, "standard"),
        "Approving bills and releasing batches is what the role is for; the requester leads AP.",
      ]),
    ],
    decided: "granted",
  },
  {
    request_id: "req_sofia_salesforce_sales_user",
    requester: SOFIA,
    role_id: "salesforce.sales_user",
    justification: "New account executive on the mid-market team.",
    ticket: "ONB-3211",
    start_date: "2026-02-01",
    end_date: "2027-01-31",
    received_offset_days: -200,
    reviews: [
      canned("grant", "A standard seller role for a new account executive. Nothing held yet, within the limit, routine.", [
        "Salesforce Sales User is a standard role: work opportunities and accounts as a seller.",
        noConflict,
        within(364, 365, "standard"),
        "A new account executive needs exactly this role; the onboarding ticket is cited.",
      ]),
    ],
    decided: "granted",
  },
  {
    request_id: "req_tom_aws_prod_read",
    requester: TOM,
    role_id: "aws.prod_read",
    justification: "Joining the on-call rotation for the platform team; I need to read CloudWatch during incidents.",
    start_date: "2026-03-10",
    end_date: "2027-03-09",
    received_offset_days: -180,
    reviews: [
      canned("grant", "Read-only production access for an on-call engineer. No conflicts, within the limit, and the justification fits the role.", [
        "AWS Production Prod Read is a standard role: read-only console and CloudWatch access.",
        noConflict,
        within(364, 365, "standard"),
        "On-call incident response needs read access to production metrics; nothing broader is asked for.",
      ]),
    ],
    decided: "granted",
  },
  {
    request_id: "req_priya_snowflake_account_admin",
    requester: PRIYA,
    role_id: "snowflake.analyst",
    justification: "Build and schedule the month-end close dashboards.",
    start_date: "2026-04-01",
    end_date: "2026-09-28",
    received_offset_days: -160,
    reviews: [
      canned(
        "escalate",
        "A privileged Snowflake role asked for 90 days to build dashboards. The role is far broader than the task, the window is over the privileged limit, and the Analyst role covers the stated need.",
        [
          "Snowflake Account Admin is a privileged role: manage warehouses, roles, and grants across the account.",
          noConflict,
          "90 days requested against the 30-day limit for privileged roles: over by 60 days",
          "Building and scheduling dashboards needs the Analyst role, not account administration; no ticket is cited.",
        ],
        ["90 days requested, over the 30-day limit for privileged roles", "the Analyst role covers building and scheduling dashboards"],
        { duration: "fail", justification: "flag" },
      ),
      canned("grant", "The resubmission asks for Snowflake Analyst for 180 days, which matches the dashboard work. No conflicts, within the limit.", [
        "Snowflake Analyst is a standard role: query the curated analytics schemas and build dashboards.",
        noConflict,
        within(180, 365, "standard"),
        "Building and scheduling the close dashboards is what the Analyst role is for.",
      ]),
    ],
    returned_note: "Account Admin is a privileged role and 90 days is over the 30-day limit. Analyst can build and schedule the close dashboards; ask for Analyst instead.",
    decided: "granted",
  },
  {
    request_id: "req_marcus_salesforce_deal_desk",
    requester: MARCUS,
    role_id: "salesforce.deal_desk",
    justification: "Approve non-standard discounts for the enterprise segment as the sales lead.",
    start_date: "2026-05-01",
    end_date: "2027-04-30",
    received_offset_days: -125,
    reviews: [
      canned("grant", "The sales lead asking for Deal Desk. He holds no commission role, so no conflict; within the limit; the justification is the role's purpose.", [
        "Salesforce Deal Desk is a standard role: approve non-standard discounts and quote terms.",
        noConflict,
        within(364, 365, "standard"),
        "Approving enterprise discounts is what Deal Desk is for; the requester leads the segment.",
      ]),
    ],
    decided: "granted",
  },
  {
    request_id: "req_ravi_okta_admin",
    requester: RAVI,
    role_id: "okta.admin",
    justification: "Migrate the engineering groups to the new sign-on policy under change CHG-771.",
    ticket: "CHG-771",
    start_date: "2026-06-01",
    end_date: "2026-06-08",
    received_offset_days: -95,
    reviews: [
      canned(
        "escalate",
        "A privileged Okta role for seven days, tied to an approved change. The window and the ticket are in order; a privileged role still needs security sign-off.",
        [
          "Okta Admin is a privileged role: manage users, groups, and sign-on policies for every application.",
          noConflict,
          within(7, 30, "privileged"),
          "Migrating sign-on policies needs Okta administration; the change ticket is cited and the window is short.",
        ],
        ["Okta Admin is a privileged role: security sign-off is needed before a grant"],
        { role: "flag" },
      ),
    ],
    decided: "granted",
    decision_note: "Security signed off (SEC-118). Seven-day window, revoked at expiry.",
  },
  {
    request_id: "req_ravi_aws_prod_deploy",
    requester: RAVI,
    role_id: "aws.prod_deploy",
    justification: "Cover the production deploys while Tom is on leave.",
    start_date: "2026-07-01",
    end_date: "2026-12-31",
    received_offset_days: -65,
    reviews: [
      canned(
        "deny",
        "Ravi holds Change Approver on the production account, and the policy never lets the person who approves a change also run the deploy. The segregation-of-duties rule denies this outright.",
        [
          "AWS Production Prod Deploy is a standard role: run the deployment pipeline against production.",
          "Conflicts with AWS Production Change Approver, which the requester holds: the approver of a change may not deploy it.",
          within(183, 365, "standard"),
          "Covering deploys is a real need, but it cannot be met by the person who approves the changes.",
        ],
        ["conflicts with AWS Production Change Approver, which the requester already holds (segregation of duties)"],
        { segregation: "fail" },
      ),
    ],
    decided: "denied",
    decision_note: "Ravi approves production changes; the same person cannot run the deploy. Another engineer covers the deploys.",
  },
  {
    request_id: "req_tom_github_org_owner",
    requester: TOM,
    role_id: "github.org_owner",
    justification: "Add the new contractors to the org and set up their repositories.",
    start_date: "2026-07-20",
    end_date: "2026-09-18",
    received_offset_days: -45,
    reviews: [
      canned(
        "escalate",
        "A privileged GitHub role asked for 60 days to add contractors. Adding members does not need org ownership, and the window is over the privileged limit.",
        [
          "GitHub Org Owner is a privileged role: manage org membership, billing, and repository settings.",
          noConflict,
          "60 days requested against the 30-day limit for privileged roles: over by 30 days",
          "An existing owner can add the contractors; the requester does not need ownership for this task, and no ticket is cited.",
        ],
        ["60 days requested, over the 30-day limit for privileged roles", "adding members does not need the Org Owner role"],
        { duration: "fail", justification: "flag" },
      ),
    ],
    decided: "denied",
    decision_note: "Org Owner is not needed to add members. Ravi adds the contractors as an existing owner.",
  },
  {
    request_id: "req_tom_snowflake_analyst",
    requester: TOM,
    role_id: "snowflake.analyst",
    justification: "Query deploy metrics for the platform reliability dashboard.",
    start_date: "2026-08-01",
    end_date: "2027-07-31",
    received_offset_days: -30,
    reviews: [
      canned("grant", "A standard Snowflake role for a reliability dashboard. No conflicts, within the limit, and the justification matches the role.", [
        "Snowflake Analyst is a standard role: query the curated analytics schemas and build dashboards.",
        noConflict,
        within(364, 365, "standard"),
        "Querying deploy metrics for a dashboard is what the Analyst role is for.",
      ]),
    ],
    decided: "granted",
  },
];
