# Eval: A Duplicate Request Is Denied

Tom re-sent his GitHub Developer request with a "seems stuck" note. Code
finds the earlier open request for the same person and role and marks this
one a duplicate, and the policy denies duplicates outright. The review must
come back `deny` and name the original. If this eval fails, the duplicate
lookup or the deny clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself (including the original req_tom_github_developer), so this eval passes alone and in any order.

## Query

"review req_tom_github_developer_again"

## Assertions

- contains: deny
- Should identify the request as a duplicate of req_tom_github_developer
- Should NOT recommend grant, limit, or escalate
