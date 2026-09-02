# Eval: A Window Over The Limit Is Limited

Sofia asks for Snowflake Analyst for 425 days. A standard role may be granted
for at most 365 days at a time, so the review must come back `limit` with
the numbers, and code clamps anything looser. If this eval fails, either the
reviewer stopped citing the arithmetic or the clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review req_sofia_snowflake_analyst"

## Assertions

- contains: limit
- Should state that 425 days is over the 365-day limit for standard roles, over by 60 days
- Should suggest a shorter window rather than denying the role
- Should NOT recommend grant
