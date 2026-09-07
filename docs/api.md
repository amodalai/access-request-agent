# Access request API

The deployed demo serves [OpenAPI 3.0.3](../public/openapi.json) at
`/openapi.json`. It describes four existing Amodal store reads:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/stores/requests` | Saved requests, with pagination and filtering |
| GET | `/api/stores/requests/{key}` | One record by `request_id` |
| GET | `/api/stores/entitlements` | Saved entitlements, with pagination and filtering |
| GET | `/api/stores/entitlements/{key}` | One record by `entitlement_id` |

These operations read the same saved demo records as the app. They cannot
grant or provision access. Open the deployed app once to load the examples before
querying them. An empty result means no matching records have been saved.

Each list returns `{documents, total, hasMore}`. Each document contains
`key`, `appId`, `store`, `version`, `payload`, and `meta`; the demo record is
inside `payload`. A single-record response is `{document, history}`.
`history` is empty unless the store retains previous versions.

`limit` defaults to 20 and `offset` defaults to 0. Increase `offset` by the
page size while `hasMore` is true. `filter` is a URL-encoded JSON object of
exact payload field matches. `sort` names a payload field; a `-` prefix
selects descending text order. Without `sort`, recently saved records come
first.

The routes read the agent's unscoped stores. The demo has no tenant scope.
Adding a `scope_id` query parameter does not change which rows are read.

## Call the deployed API

Use an `ak_` runtime API key for this agent, or a short-lived runtime token.
A platform automation token (`pk_`) is not a runtime credential. Signed-in
browsers can use the same-origin session cookie. A gated deployment also
requires authentication when downloading `/openapi.json`.

Set `ACCESS_API_URL` to the deployed agent origin, without a trailing slash,
and `ACCESS_API_KEY` to its runtime credential. Keep credentials out of source
files and browser build variables.

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $ACCESS_API_KEY" \
  "$ACCESS_API_URL/openapi.json" | jq '{openapi, paths: (.paths | keys)}'

curl --fail --silent --show-error --get \
  -H "Authorization: Bearer $ACCESS_API_KEY" \
  --data-urlencode 'filter={"status":"reviewed"}' \
  --data-urlencode 'limit=5' \
  "$ACCESS_API_URL/api/stores/requests"

curl --fail --silent --show-error \
  -H "Authorization: Bearer $ACCESS_API_KEY" \
  "$ACCESS_API_URL/api/stores/requests/req_tom_github_developer"
```

A missing record returns 404. Invalid filter JSON returns 400. Missing or
invalid runtime credentials return 401; a credential for another agent can
return 403. Store failures return 500. Without a bearer or session cookie,
a gated agent can redirect to login; that HTML is not an API response.

## Use this API from another Amodal agent

Set these environment variables on the consuming agent:

| Variable | Value |
| --- | --- |
| `ACCESS_API_URL` | The deployed demo origin |
| `ACCESS_OPENAPI_URL` | The same origin followed by `/openapi.json` |
| `ACCESS_API_KEY` | A runtime credential for the deployed demo |

Create `amodal/connections/demo/spec.json`:

```json
{
  "baseUrl": "env:ACCESS_API_URL",
  "openapi": {
    "source": "env:ACCESS_OPENAPI_URL",
    "exposure": "discovery"
  },
  "auth": { "type": "bearer", "token": "env:ACCESS_API_KEY" }
}
```

Create `amodal/connections/demo/policy.json` with `{"endpoints": {}}` and
add `"demo"` to the consuming agent's `connections` list in `agent.json`.
The explicit `baseUrl` configures runtime routing; the OpenAPI document's
relative server URL does not configure an Amodal connection.

Ask the consuming agent to list five requests. It calls
`demo__discover` with `{"query":"list_requests"}`, then calls
`demo__list_requests` with `{"query":{"limit":5}}` on the next model reply.
It should report records from `documents[].payload` and check `hasMore`
before claiming a complete list. Failed reads mean the records could not be
checked.

The native connection sends its configured credential when fetching the
OpenAPI document on the API's origin. It caches URL documents for 60 seconds.
Use discovery's `refresh` option, or wait 60 seconds and start a fresh session
after changing the contract. A local UI build serves the document as a static asset, but the
store routes require an Amodal runtime at the configured API origin.

## Verify

```sh
npm test
npm run typecheck
npm run build
cmp public/openapi.json dist/openapi.json
```

The contract tests check the read-only paths, component references, store
field types, and seeded response payloads. Cloud's runtime implements the
routes; Vite copies `public/openapi.json` into the deployed UI artifact.
These local checks do not verify a live deployment. Run the authenticated
calls above against the deployed agent to verify its routing and credentials.
