# Hevy MCP Server

A remote Model Context Protocol (MCP) server for the Hevy fitness tracking API, deployed on Cloudflare Workers. Multi-user: people sign in with GitHub, store their own Hevy API key, and connect from any MCP client over Streamable HTTP with OAuth.

**Production:** `https://hevy.tomt.it/mcp` (custom domain configured in `wrangler.jsonc`). People are actively using it; treat changes to auth and tool schemas as breaking.

## Commands

```bash
npm start              # wrangler dev --env dev on :8787 (needs .dev.vars, see .dev.vars.example)
npm test               # vitest run (330+ tests)
npm run type-check     # tsc --noEmit
npm run format         # biome format --write
npm run lint:fix       # biome lint --fix
npm run deploy         # wrangler deploy (production)
```

Local dev without a GitHub app, for smoke-testing public routes only:

```bash
npx wrangler dev --env dev --var GITHUB_CLIENT_ID:x --var GITHUB_CLIENT_SECRET:x --var COOKIE_ENCRYPTION_KEY:$(printf '0%.0s' {1..64})
```

## Architecture

```
src/
├── index.ts             # Worker entry: exports Hono app (default) and MyMCP Durable Object
├── app.ts               # Hono app: global CORS, onError, route mounting (OAuth → MCP → utility)
├── github-handler.ts    # OAuth 2.1 authorization server + setup pages + key management API
├── mcp-agent.ts         # MyMCP extends McpAgent (Durable Object); loads the user's Hevy key
├── mcp-handlers.ts      # MyMCP.serve("/mcp") and legacy MyMCP.serveSSE("/sse")
├── tools.ts             # createHevyServer()/registerHevyTools(): all 17 tools, transport-independent
├── tool-catalog.ts      # TOOL_GROUPS / TOOL_NAMES: the one list of tools (home page + tests derive from it)
├── version.ts           # VERSION read from package.json (used by /health, server info, pages)
├── utils.ts             # Props type + GitHub OAuth helpers
├── workers-oauth-utils.ts # consent form parsing, per-user client approvals in KV
├── middleware/auth.ts   # bearerAuth: KV session lookup, RFC 9728 WWW-Authenticate challenge
├── routes/mcp.ts        # /mcp, /mcp/*, /sse, /sse/* → handlers, props via ctx.props
├── routes/utility.ts    # /health, /stats, /
├── ui/                  # layout.ts (tokens, escapeHtml, renderPage), home.ts, setup.ts, approval.ts
└── lib/
    ├── client.ts        # HevyClient (fetch wrapper, HevyApiError)
    ├── schemas.ts       # Zod schemas (snake_case MCP side) + transform*ToAPI
    ├── transforms.ts    # validatePagination/ISO8601/workout/routine, PAGINATION_LIMITS
    ├── errors.ts        # handleError → formatted MCP tool error responses
    ├── key-storage.ts   # AES-GCM encrypted Hevy keys in KV (hevy_key:<login>)
    ├── oauth-clients.ts # resolveClient (setup | DCR record | Client ID Metadata Document), redirect URI checks
    ├── pkce.ts          # S256 verification
    └── base-url.ts      # getBaseUrl (X-Forwarded-Host, wrangler localhost), MCP + PRM URLs
test/                    # vitest; test/tools.test.ts drives tools through an in-memory MCP client
api.json                 # Snapshot of Hevy's OpenAPI spec (https://api.hevyapp.com/docs)
```

### Request flow

1. MCP client hits `/mcp` without a token → 401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`.
2. Client reads protected resource metadata, then `/.well-known/oauth-authorization-server` (this worker is its own AS).
3. Client registers (Client ID Metadata Document URL, or `POST /register`) and calls `GET /authorize` with PKCE S256.
4. User signs in with GitHub (`/callback`), approves on the consent page (`POST /authorize`), gets redirected with `code` + `iss`.
5. `POST /token` verifies PKCE and mints a 30-day bearer token stored as `session:<token>` in KV.
6. `bearerAuth` resolves the token to `Props` and passes them as `ctx.props` to the Durable Object; `MyMCP.getClient()` decrypts the user's Hevy key (cached 5 min).

### KV keys (`OAUTH_KV`)

| Prefix | Content | TTL |
| --- | --- | --- |
| `session:<token>` | `BrowserSession` (identity + GitHub access token) behind the `session` cookie | 30 d |
| `token:<token>` | `Props` (login/name/email/baseUrl only) for MCP bearer tokens minted by `/token`. `bearerAuth` also accepts `session:` records until pre-3.2.0 tokens expire (remove that fallback after 2025-12-01). | 30 d |
| `hevy_key:<login>` | AES-GCM encrypted Hevy API key | none |
| `client:<id>` | DCR registration (redirect_uris, client_name, …) | 1 y |
| `cimd:<url>` | cached Client ID Metadata Document | 1 h |
| `approval:<login>:<clientId>` | `"true"` once the user approved a client | 1 y |
| `oauth_state:<state>` | `{kind:"authorize", pending}` for MCP clients or `{kind:"login", returnTo}` for plain web sign-in, while the user is at GitHub | 10 min |
| `authcode:<code>` | single-use authorization code (+ PKCE challenge) | 10 min |

### Security invariants (keep these)

- `redirect_uri` must match the client's registration/metadata document before anything is issued or redirected to. Unknown client or mismatched URI → plain 400, never a redirect.
- PKCE S256 is mandatory for every client, no exceptions; `plain` is rejected. The `/setup` page signs in through its own GitHub round-trip (`oauth_state` kind `login`), not through `/authorize`, so there is no internal OAuth client.
- MCP access tokens (`token:`) never contain the GitHub access token; only browser sessions (`session:`) do.
- Authorization codes are deleted on first use, success or failure.
- Everything interpolated into HTML goes through `escapeHtml` (`src/ui/layout.ts`). The consent page renders attacker-controlled `client_id`, `redirect_uri`, `state` and `client_name`.
- Hevy API keys are never returned to clients or rendered; only `maskApiKey` output is shown.

## Tools

17 tools registered in `src/tools.ts` via `server.registerTool` with `title`, `description`, `inputSchema` and `annotations` (`readOnlyHint` for `get_*`, `destructiveHint` for `update_*`). The server also publishes `instructions` (never guess exercise IDs, ISO 8601 times, update tools replace the whole record).

| Group | Tools |
| --- | --- |
| Workouts | `get_workouts`, `get_workout`, `create_workout`, `update_workout`, `get_workouts_count`, `get_workout_events` |
| Routines | `get_routines`, `get_routine`, `create_routine`, `update_routine` |
| Exercises | `get_exercise_templates`, `get_exercise_template`, `create_exercise_template`, `get_exercise_history` |
| Folders | `get_routine_folders`, `get_routine_folder`, `create_routine_folder` |

Schema notes:
- Workout exercises need `title` + `exercise_template_id`; `index` fields are generated from array order (`transformWorkoutToAPI`).
- Routine exercises use only `exercise_template_id` (no `title`/`index`); routine sets support `rep_range`, not `rpe`.
- Page size limits live in `PAGINATION_LIMITS` and are mirrored in the Zod schemas (`.max()`), so clients see them in `tools/list`.

### Adding a tool

1. Add the method to `HevyClient` in `src/lib/client.ts`.
2. Register it in `src/tools.ts` using the local `tool()` helper (handler receives validated args and the user's `HevyClient`; thrown errors are formatted by `handleError`).
3. Add the name to the matching group in `src/tool-catalog.ts` (the home page and `TOOL_NAMES` derive from it).
4. Add a test in `test/tools.test.ts` (in-memory MCP client) and, for client changes, `test/lib/client.test.ts`.
5. `npm test && npm run type-check`, then update the README tool table.

Hevy endpoints in the live spec that are not exposed yet: `GET /v1/user/info`, `GET|POST /v1/body_measurements`, `GET|PUT /v1/body_measurements/{date}`. The `ExerciseTemplate` response now also carries `equipment` and `thumbnail_url`.

## Configuration

Secrets (`npx wrangler secret put …`): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY` (32-byte hex, `openssl rand -hex 32`). Locally these go in `.dev.vars`. The legacy single-user `HEVY_API_KEY` is no longer used.

Bindings (`wrangler.jsonc`): `OAUTH_KV` (KV), `MCP_OBJECT` (Durable Object `MyMCP`, SQLite-backed). The `dev` env has its own KV namespace and no custom route. `limits.cpu_ms` is set to 50.

## Connecting clients

- **Claude (web/desktop):** Settings → Connectors → Add custom connector → `https://hevy.tomt.it/mcp`. Claude uses OAuth discovery; no client credentials.
- **Claude Code:** `claude mcp add --transport http hevy https://hevy.tomt.it/mcp` then `/mcp`.
- **Legacy/stdio-only clients:** `npx mcp-remote https://hevy.tomt.it/mcp`.
- **Inspector:** `npx @modelcontextprotocol/inspector http://localhost:8787/mcp`.

The `/sse` endpoint still exists for old clients but the HTTP+SSE transport is deprecated in the MCP spec; do not document it for new users.

## Tech stack and known debt

- Hono 4, `@modelcontextprotocol/sdk` 1.20 (protocol 2025-06-18), `agents` 0.2.x (`McpAgent`), Zod 3, Wrangler 4, Vitest 3, Biome 2.
- **`McpAgent` is deprecated upstream** (Agents SDK ≥ 0.20, July 2026) in favour of the stateless `createMcpHandler` from `agents/mcp/server` with `@modelcontextprotocol/server` (SDK v2, protocol 2026-07-28, no sessions/Durable Object). `src/tools.ts` is already transport-independent; migration touches `mcp-agent.ts`, `mcp-handlers.ts`, `routes/mcp.ts`, `wrangler.jsonc` and requires Zod 4. Do this as its own change with the SDK v2 migration guide open.
- Dynamic Client Registration is deprecated in MCP 2026-07-28; keep `/register` for compatibility, Client ID Metadata Documents are the primary path.
- No refresh tokens; tokens are 30-day opaque KV sessions. `/stats` counts are capped at 1000 by `kv.list`.

## Version history

- **3.2.0** (2026-10) Interface refresh and security hardening: shared UI layout with dark mode and current client instructions; `redirect_uri` validation against registrations / Client ID Metadata Documents; mandatory PKCE S256; `iss` in authorization responses; separate bearer tokens per client; RFC 9728 `WWW-Authenticate` challenge and path-suffixed protected resource metadata; HTML escaping on consent/setup pages; tools moved to `src/tools.ts` with titles, descriptions, annotations and server instructions; API key loaded lazily per call instead of failing session init; removed unused deps (`@cloudflare/workers-oauth-provider`, `octokit`); `api.json` refreshed from the live Hevy spec.
- **3.1.0** Hono refactor, modular routes/middleware, 272 tests, `/stats`.
- **3.0.0** Multi-user GitHub OAuth, per-user encrypted Hevy keys, 17 tools.
- **2.1.x** Streamable HTTP migration, workout/routine schema fixes.

## License

Unlicense. Not affiliated with Hevy; Hevy is a trademark of Hevy Studios Inc.
