# Eval: A Role Broader Than The Need Is Limited

Sofia asks for Workday HR Read to see the org chart for territory planning.
Every number is fine: a standard role, 90 days, no conflict. The judgment the
reviewer makes and code cannot: HR Read exposes compensation and personal
data, and an org chart does not need it. The review must come back `limit`,
with the mismatch named.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review req_sofia_workday_hr_read"

## Assertions

- contains: limit
- Should say that HR Read is broader than what an org chart for territory planning needs (it includes compensation and personal data)
- Should NOT report a duration or segregation problem: the window is within the limit and nothing conflicts
- Should NOT recommend grant
