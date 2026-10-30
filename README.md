# Hevy MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io/) server for the [Hevy](https://www.hevyapp.com/) fitness tracking API, running on Cloudflare Workers. Connect it to Claude (or any MCP client) to browse and log workouts, manage routines and track progress by chatting.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tomtorggler/hevy-mcp-server)

- **Multi-user**: sign in with GitHub, add your own Hevy API key, done. One deployment serves many people.
- **Standards-based auth**: OAuth 2.1 with PKCE, protected resource metadata (RFC 9728), Client ID Metadata Documents and Dynamic Client Registration. Works out of the box as a custom connector in Claude.
- **Streamable HTTP** transport at `/mcp`.
- **17 tools** with titles, descriptions and annotations covering the Hevy public API.

## 🏋️ Tools

| Area | Tools |
| --- | --- |
| Workouts | `get_workouts`, `get_workout`, `create_workout`, `update_workout`, `get_workouts_count`, `get_workout_events` |
| Routines | `get_routines`, `get_routine`, `create_routine`, `update_routine` |
| Exercises | `get_exercise_templates`, `get_exercise_template`, `create_exercise_template`, `get_exercise_history` |
| Folders | `get_routine_folders`, `get_routine_folder`, `create_routine_folder` |

Read tools are marked `readOnlyHint`; `update_*` tools replace the whole record and are marked destructive so clients can ask before running them.

## 🔌 Using a hosted instance

1. Open the server's home page and click **Connect your Hevy account**. Sign in with GitHub and paste your API key from [Hevy Settings → Developer](https://hevy.com/settings?developer) (requires Hevy Pro).
2. Add the server to your client using its `/mcp` URL:
   - **Claude (web/desktop)**: Settings → Connectors → *Add custom connector* → paste the URL. No client ID or credentials are needed.
   - **Claude Code**: `claude mcp add --transport http hevy https://<your-host>/mcp`, then `/mcp` to sign in.
   - **Other clients**: anything that speaks Streamable HTTP with OAuth. stdio-only clients can bridge with `npx mcp-remote https://<your-host>/mcp`.
3. Approve the connection in the browser window your client opens.

## 🚀 Deploying your own

### Prerequisites

- A Cloudflare account and `npx wrangler login`
- A GitHub OAuth App (Settings → Developer settings → OAuth Apps) with the callback URL `https://<your-host>/callback`

### Steps

```bash
git clone https://github.com/tomtorggler/hevy-mcp-server.git
cd hevy-mcp-server
npm install

# Create the KV namespace and put its id into wrangler.jsonc (kv_namespaces → OAUTH_KV)
npx wrangler kv namespace create OAUTH_KV

# Secrets
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
openssl rand -hex 32 | npx wrangler secret put COOKIE_ENCRYPTION_KEY   # encrypts stored Hevy keys

npm run deploy
```

Adjust the `routes` entry in `wrangler.jsonc` to your own domain (or remove it to use the `*.workers.dev` URL).

### Local development

```bash
cp .dev.vars.example .dev.vars   # fill in a dev GitHub OAuth App + encryption key
npm start                         # http://localhost:8787
```

Useful checks:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/.well-known/oauth-protected-resource/mcp
npx @modelcontextprotocol/inspector http://localhost:8787/mcp
```

## 📖 Usage examples

> "Show me my last 5 workouts"

> "Log a workout from today 10:00 to 11:00: bench press 3×10 at 100 kg, squats 4×8 at 120 kg"

> "How has my deadlift progressed this year?"

> "Create a Push Day routine with bench press 4 sets of 8–12 at 100 kg and overhead press 3×10 at 60 kg"

The assistant looks up exercise IDs with `get_exercise_templates`, then calls the matching write tool. The server publishes instructions so clients know that `update_*` tools replace the whole record and that exercise IDs must never be guessed.

## 🔧 Data shapes

All parameters are `snake_case`. Times are ISO 8601 with timezone (`2024-10-15T10:00:00Z`), weights in kilograms, distances in meters, durations in seconds.

**Workout** (`create_workout`, `update_workout`): `title`, `start_time`, `end_time`, optional `description`, `routine_id`, `is_private`, and `exercises[]` with `title`, `exercise_template_id`, optional `superset_id`, `notes`, and `sets[]` of `type` (`warmup` | `normal` | `failure` | `dropset`), `weight_kg`, `reps`, `distance_meters`, `duration_seconds`, `custom_metric`, `rpe` (6–10 in half steps). Exercise and set `index` fields are generated from array order.

**Routine** (`create_routine`, `update_routine`): `title`, optional `folder_id`, `notes`, and `exercises[]` with `exercise_template_id`, optional `superset_id`, `rest_seconds`, `notes`, and `sets[]` that may use `rep_range: { start, end }` instead of `reps`. Routines do not take `title` on exercises or `rpe` on sets.

**Custom exercise** (`create_exercise_template`): `title`, `exercise_type`, `equipment_category`, `muscle_group`, optional `other_muscles[]`.

## 🔐 How auth works

```
MCP client ── 401 + WWW-Authenticate(resource_metadata) ──▶ /.well-known/oauth-protected-resource/mcp
           ── discovers ──▶ /.well-known/oauth-authorization-server
           ── CIMD or POST /register ──▶ client_id
           ── GET /authorize (PKCE S256) ──▶ GitHub sign-in ──▶ consent ──▶ code (+ iss)
           ── POST /token (code_verifier) ──▶ 30-day bearer token
           ── POST /mcp (Bearer) ──▶ Durable Object session ──▶ Hevy API (user's key)
```

- Redirect URIs are validated against the client's registration or metadata document before any code is issued.
- Hevy API keys are AES-GCM encrypted in KV with `COOKIE_ENCRYPTION_KEY` and never returned to clients.
- Each MCP client receives its own token; signing out of the web UI does not revoke connected clients, and removing your API key disables all of them.

## 🛠️ Development

```
src/
├── index.ts             # Worker entry: Hono app + Durable Object export
├── app.ts               # CORS, error handling, route mounting
├── github-handler.ts    # OAuth 2.1 AS (authorize/token/register), discovery metadata, setup pages
├── mcp-agent.ts         # McpAgent Durable Object: per-user Hevy client
├── mcp-handlers.ts      # Streamable HTTP (and legacy SSE) handlers
├── tools.ts             # The 17 MCP tools (transport-independent)
├── version.ts           # Version read from package.json
├── middleware/auth.ts   # Bearer token middleware with RFC 9728 challenge
├── routes/              # /mcp, /sse, /health, /stats, /
├── ui/                  # Home, setup and consent pages (shared layout, dark mode)
└── lib/                 # Hevy client, schemas, validation, errors, key storage, OAuth clients, PKCE
test/                    # Vitest suite, incl. in-memory MCP client tests
api.json                 # Hevy OpenAPI spec (snapshot of https://api.hevyapp.com/docs)
```

```bash
npm test             # run the suite
npm run type-check   # tsc
npm run format       # biome
```

### Adding a tool

1. Add the API call to `src/lib/client.ts`.
2. Register the tool in `src/tools.ts` with a title, description, Zod input schema and annotations:
   ```ts
   tool("get_thing", {
       title: "Get thing",
       description: "What it does and when to use it.",
       inputSchema: { thing_id: z.string().describe("...") },
       annotations: READ_ONLY,
   }, async ({ thing_id }, client) => ({ content: [text(JSON.stringify(await client.getThing(thing_id)))] }));
   ```
   Errors thrown inside the handler are formatted by `handleError`.
3. Add it to `TOOL_NAMES` and to the tool groups in `src/ui/home.ts`; `test/tools.test.ts` checks the list.

## 📚 Resources

- [Hevy API docs](https://api.hevyapp.com/docs)
- [MCP specification](https://modelcontextprotocol.io/specification/latest)
- [Cloudflare Agents: MCP](https://developers.cloudflare.com/agents/model-context-protocol/)

## 📝 License

Unlicense - see [LICENSE](LICENSE).

This project is not affiliated with Hevy. Hevy is a trademark of Hevy Studios Inc.
