# Eval: A Segregation-Of-Duties Conflict Is Denied

Priya holds NetSuite AP Clerk and asks for AP Approver to cover for her
manager. Code finds the conflicting entitlement, and the policy never lets
one person both enter and approve vendor bills. The review must come back
`deny` and name the held role. If this eval fails, the conflict lookup or the
deny clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself (including Priya's AP Clerk entitlement), so this eval passes alone and in any order.

## Query

"review req_priya_netsuite_ap_approver"

## Assertions

- contains: deny
- Should state that AP Approver conflicts with the AP Clerk role Priya already holds (segregation of duties)
- Should NOT recommend grant, limit, or escalate
