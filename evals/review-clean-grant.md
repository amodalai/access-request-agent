# Eval: A Clean Request Is Granted

Tom's GitHub Developer request is the clean case: a standard role, nothing
held that conflicts with it, a 364-day window under the limit, an onboarding
ticket, and a justification that is the role's purpose. The review must come
back `grant`. If this eval fails after a reviewer or policy edit, the change
tightened the policy more than intended.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review req_tom_github_developer"

## Assertions

- contains: grant
- Should recommend grant, with every check passing
- Should cite the access_math arithmetic in the duration check (364 days against the 365-day limit for standard roles)
- Should NOT say the role was provisioned or granted by the agent
