# Eval: A History Question Is Answered From The Events Store

Every action on a request leaves a row in the `events` store, and the chat
agent reads that store. Asked what happened to a request, it must report the
recorded events with their actors, and must not invent a review or a
decision that is not there. On fresh stores Sofia's HR Read request has only
its `seeded` event, so the truthful answer is that nothing has happened yet
beyond its arrival; once reviewed, the answer names the review.

## Setup

Context: The stores may be fresh (only seeded events) or carry earlier reviews from this suite. Either way the answer must come from the events store, not from a guess.

## Query

"What happened to Sofia's request req_sofia_workday_hr_read so far? Who did what?"

## Assertions

- Should describe the recorded events for req_sofia_workday_hr_read with the actor of each, or state that the request has only arrived (been seeded or submitted) and has not been reviewed yet
- Should NOT claim the request was granted, denied, or returned unless such an event is in the store
- Should NOT say access was provisioned or that a role was added in a real system
- Should NOT report an error
