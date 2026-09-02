# Access Policy (fictional)

> Demo content for a fictional company ("Halden Systems"). Not real security,
> compliance, or legal advice. The app recommends a decision for a human
> system owner; it never provisions access in a real system.

This policy says which access requests a system owner may grant as they
stand, which should be narrowed first, which need security sign-off, and
which must be denied.

## Limits

| Rule                          | Value                                   |
| ----------------------------- | --------------------------------------- |
| Privileged role, per grant    | At most **30 days**                     |
| Standard role, per grant      | At most **365 days**                    |
| Privileged roles              | AWS Production Prod Admin, GitHub Org Owner, Okta Admin, Snowflake Account Admin |

## Segregation of duties

One person may never hold both roles of a pair:

| System         | Pair                                |
| -------------- | ----------------------------------- |
| Salesforce     | Deal Desk and Commission Admin      |
| NetSuite       | AP Clerk and AP Approver            |
| AWS Production | Prod Deploy and Change Approver     |

## Grant

- The role is in the catalog and is a **standard** role.
- The requester holds no role that conflicts with it, and does not hold it
  already.
- The window is within the limit for the role.
- The justification describes work the role's purpose covers, and no
  narrower role would cover it.
- It is not a duplicate of a request that is still open.

## Limit (grant less than asked)

- The window is **over the limit** for the role: grant it for the limit at
  most, after the requester shortens the request.
- A **narrower role** covers the stated work (an analyst role instead of an
  admin role, read access instead of write).
- The justification is thin for the scope asked: ask what the access is for,
  or grant the narrower role that fits it.

## Escalate (needs security sign-off)

- The role is **privileged**, even when everything else is in order. A
  privileged request should cite an incident, change, or onboarding ticket;
  without one, say so in the issues.
- Anything that looks wrong but fits no rule above: a justification that
  does not match the requester's team, a window that starts in the past, an
  unusual note.

## Deny

- A **segregation-of-duties conflict**: the requester holds the other role
  of a pair.
- The requester **already holds** the role.
- A **duplicate**: the same person has an open request for the same role.
- A role the catalog does not have.

When several rules apply, take the most conservative one: deny over
escalate, escalate over limit, limit over grant.
