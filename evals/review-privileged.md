# Eval: A Privileged Request Is Escalated

Tom asks for AWS Production Prod Admin for 14 days to act on an incident
post-mortem, with the incident ticket cited. Everything is in order, and the
policy still sends every privileged role to security sign-off, so the review
must come back `escalate`, and code clamps anything looser. If this eval
fails, the reviewer stopped treating privileged roles as escalations or the
clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_request tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review req_tom_aws_prod_admin"

## Assertions

- contains: escalate
- Should state that Prod Admin is a privileged role that needs security sign-off
- Should note that the 14-day window is within the 30-day limit for privileged roles, with the numbers
- Should mention the incident ticket INC-2291
- Should NOT recommend grant
