/**
 * The systems and roles an employee can ask for, and the segregation-of-duties
 * pairs no one person may hold at once. Policy data, read-only: the access
 * policy text and the guard hook's config mirror the privileged roles and the
 * pairs, so a change here is a change in three places.
 */
export type Sensitivity = "standard" | "privileged";

export interface Role {
  role_id: string;
  system: string;
  role: string;
  sensitivity: Sensitivity;
  /** What the role is for: the text the reviewer judges a justification against. */
  purpose: string;
}

export const ROLES: Role[] = [
  { role_id: "salesforce.sales_user", system: "Salesforce", role: "Sales User", sensitivity: "standard", purpose: "Work opportunities and accounts in Salesforce as a seller." },
  { role_id: "salesforce.deal_desk", system: "Salesforce", role: "Deal Desk", sensitivity: "standard", purpose: "Approve non-standard discounts and quote terms." },
  { role_id: "salesforce.commission_admin", system: "Salesforce", role: "Commission Admin", sensitivity: "standard", purpose: "Configure and release commission payouts." },
  { role_id: "netsuite.ap_clerk", system: "NetSuite", role: "AP Clerk", sensitivity: "standard", purpose: "Enter vendor bills and prepare payment batches." },
  { role_id: "netsuite.ap_approver", system: "NetSuite", role: "AP Approver", sensitivity: "standard", purpose: "Approve vendor bills and release payment batches." },
  { role_id: "netsuite.gl_read", system: "NetSuite", role: "GL Read", sensitivity: "standard", purpose: "Read the general ledger and run financial reports." },
  { role_id: "aws.prod_read", system: "AWS Production", role: "Prod Read", sensitivity: "standard", purpose: "Read-only console and CloudWatch access to the production account." },
  { role_id: "aws.prod_deploy", system: "AWS Production", role: "Prod Deploy", sensitivity: "standard", purpose: "Run the deployment pipeline against production." },
  { role_id: "aws.change_approver", system: "AWS Production", role: "Change Approver", sensitivity: "standard", purpose: "Approve production change requests before a deploy runs." },
  { role_id: "aws.prod_admin", system: "AWS Production", role: "Prod Admin", sensitivity: "privileged", purpose: "Administrator on the production account: IAM, networking, and data stores." },
  { role_id: "github.developer", system: "GitHub", role: "Developer", sensitivity: "standard", purpose: "Push to repositories and open pull requests in the Halden org." },
  { role_id: "github.org_owner", system: "GitHub", role: "Org Owner", sensitivity: "privileged", purpose: "Manage org membership, billing, and repository settings." },
  { role_id: "okta.admin", system: "Okta", role: "Okta Admin", sensitivity: "privileged", purpose: "Manage users, groups, and sign-on policies for every application." },
  { role_id: "snowflake.analyst", system: "Snowflake", role: "Analyst", sensitivity: "standard", purpose: "Query the curated analytics schemas and build dashboards." },
  { role_id: "snowflake.account_admin", system: "Snowflake", role: "Account Admin", sensitivity: "privileged", purpose: "Manage warehouses, roles, and grants across the Snowflake account." },
  { role_id: "workday.hr_read", system: "Workday", role: "HR Read", sensitivity: "standard", purpose: "Read worker records, including compensation and personal data." },
];

/** Roles one person may never hold together. Each pair is listed once. */
export const SOD_PAIRS: Array<[string, string]> = [
  ["salesforce.deal_desk", "salesforce.commission_admin"],
  ["netsuite.ap_clerk", "netsuite.ap_approver"],
  ["aws.prod_deploy", "aws.change_approver"],
];

const byId = new Map(ROLES.map((r) => [r.role_id, r]));

export const roleOf = (role_id: string): Role | undefined => byId.get(role_id);

export const roleLabel = (r: Pick<Role, "system" | "role">) => `${r.system} ${r.role}`;

export const conflictsOf = (role_id: string): string[] =>
  SOD_PAIRS.filter((p) => p.includes(role_id)).map(([a, b]) => (a === role_id ? b : a));

export const PRIVILEGED_ROLE_IDS = ROLES.filter((r) => r.sensitivity === "privileged").map((r) => r.role_id);

/** Everyone who appears on a request, with the manager the request is stamped with. */
export const PEOPLE: Record<string, { manager: string }> = {
  "Priya Nair (Finance)": { manager: "Dana Whitfield (Finance)" },
  "Tom Becker (Engineering)": { manager: "Ravi Menon (Engineering)" },
  "Sofia Ruiz (Sales)": { manager: "Marcus Lee (Sales)" },
  "Dana Whitfield (Finance)": { manager: "Elena Voss (Executive)" },
  "Ravi Menon (Engineering)": { manager: "Elena Voss (Executive)" },
  "Marcus Lee (Sales)": { manager: "Elena Voss (Executive)" },
};

/** The requester persona: one employee, no picker. */
export const REQUESTER = "Priya Nair (Finance)";

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** One entitlement per person and role: a re-grant replaces the expired row. */
export const entitlementKey = (person: string, role_id: string) => `ent_${slug(person)}_${slug(role_id)}`;
