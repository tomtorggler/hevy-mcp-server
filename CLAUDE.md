# Hevy MCP Server

A remote Model Context Protocol (MCP) server for the Hevy fitness tracking API, deployed on Cloudflare Workers.

## Overview

This project provides a remote MCP server that exposes Hevy API functionality as MCP tools. It allows AI assistants like Claude to interact with your Hevy workout data without authentication complexity.

**Live URL:** https://hevy-mcp-server.tom-7bc.workers.dev/mcp

## Features

- **Authless MCP Server**: No OAuth required for clients to connect
- **Hevy API Integration**: Secure API key stored as Cloudflare secret
- **Remote Access**: Works from any MCP client via streamable-http transport
- **Edge Deployment**: Fast global access via Cloudflare Workers
- **Future-Proof**: Uses streamable-http transport (SSE is deprecated in MCP spec)

## Available Tools

The server now provides comprehensive access to the Hevy API with the following tools:

### Workouts

#### `get_workouts`
Get a paginated list of workouts with details.
- **Parameters:** `page` (default: 1), `pageSize` (default: 10, max: 10)

#### `get_workout`
Get a single workout by ID with full details.
- **Parameters:** `workoutId` (string)

#### `create_workout`
Log a new workout with exercises and sets.
- **Parameters:** `title`, `startTime`, `endTime`, `exercises` (array), `description`, `isPrivate`
- **Note:** Each exercise in the array requires a `title` field (exercise name from template). The `index` fields for exercises and sets are auto-generated.

#### `get_workouts_count`
Get the total number of workouts in your account.
- **Parameters:** None

### Routines

#### `get_routines`
Get a paginated list of workout routines.
- **Parameters:** `page` (default: 1), `pageSize` (default: 5, max: 10)

#### `get_routine`
Get a single routine by ID with full exercise details.
- **Parameters:** `routineId` (string)

#### `create_routine`
Create a new workout routine/program.
- **Parameters:** `title`, `exercises` (array), `folderId`, `notes`
- **Note:** Each exercise in the array requires a `title` field (exercise name from template). The `index` fields for exercises and sets are auto-generated.

### Exercise Templates

#### `get_exercise_templates`
Get available exercise templates (both built-in and custom).
- **Parameters:** `page` (default: 1), `pageSize` (default: 20, max: 100)

#### `get_exercise_history`
Get exercise history for tracking progress over time.
- **Parameters:** `exerciseTemplateId` (string), `startDate`, `endDate`

### Routine Folders

#### `get_routine_folders`
Get routine organization folders.
- **Parameters:** `page` (default: 1), `pageSize` (default: 10, max: 10)

## Configuration

### Environment Variables

**Local Development:**
- Create `.dev.vars` file with your Hevy API key
- Format: `HEVY_API_KEY=your-api-key-here`
- Get your API key from: https://hevy.com/settings?developer

**Production:**
- API key stored as Cloudflare secret
- Set via: `npx wrangler secret put HEVY_API_KEY`

### Project Structure

```
tto-hevy-mcp/
├── src/
│   ├── index.ts          # MCP server implementation & tool registration
│   └── lib/
│       └── client.ts     # Hevy API client wrapper
├── .dev.vars             # Local environment variables (gitignored)
├── .dev.vars.example     # Template for environment variables
├── api.json              # Hevy API OpenAPI specification
├── wrangler.jsonc        # Cloudflare Workers configuration
├── package.json          # Dependencies and scripts
└── CLAUDE.md            # This file
```

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Hevy Pro account with API key

### Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API key:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your Hevy API key
```

3. Start development server:
```bash
npm start
```

Server will run at: http://localhost:8787/mcp (streamable-http)

### Testing Locally

You can test the local server using:

**MCP Inspector:**
```bash
npx @modelcontextprotocol/inspector http://localhost:8787/mcp
```

**Claude Desktop:**
Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8787/mcp"]
    }
  }
}
```

## Deployment

### Deploy to Cloudflare

1. Authenticate with Cloudflare:
```bash
npx wrangler login
```

2. Set API key secret:
```bash
echo "your-api-key" | npx wrangler secret put HEVY_API_KEY
```

3. Deploy:
```bash
npm run deploy
```

Your server will be live at: `https://hevy-mcp-server.tom-7bc.workers.dev/mcp`

### Verify Deployment

Check secrets:
```bash
npx wrangler secret list
```

Check deployment status:
```bash
npx wrangler whoami
```

## Connecting to the MCP Server

### Claude Desktop (Production)

Add to your config:
```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["mcp-remote", "https://hevy-mcp-server.tom-7bc.workers.dev/mcp"]
    }
  }
}
```

### Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter URL: `https://hevy-mcp-server.tom-7bc.workers.dev/mcp`
3. Start using the tools

### Other MCP Clients

Use the `mcp-remote` adapter:
```bash
npx mcp-remote https://hevy-mcp-server.tom-7bc.workers.dev/mcp
```

## API Reference

This server implements the Hevy API v1. Full API documentation available in `api.json`.

**Base API URL:** https://api.hevyapp.com/v1

**Implemented Endpoints:**
- ✅ `/v1/workouts` - Get/create workouts
- ✅ `/v1/workouts/{id}` - Get specific workout
- ✅ `/v1/workouts/count` - Get total workout count
- ✅ `/v1/routines` - Get/create routines
- ✅ `/v1/routines/{id}` - Get specific routine
- ✅ `/v1/exercise_templates` - Get exercise templates
- ✅ `/v1/exercise_history/{id}` - Get exercise history
- ✅ `/v1/routine_folders` - Get routine folders

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript
- **MCP SDK:** @modelcontextprotocol/sdk v1.19.1
- **Agent Framework:** agents v0.2.8
- **Validation:** Zod v3.25.76

## Architecture

### Durable Objects

The MCP server uses Cloudflare Durable Objects to maintain stateful connections:
- Each MCP client session backed by a Durable Object
- Class: `MyMCP` extends `McpAgent`
- Binding: `env.MCP_OBJECT`

### Transport

- **Primary:** Streamable HTTP at `/mcp` (recommended)
- **Legacy:** Server-Sent Events (SSE) at `/sse` (deprecated)
- **Health Check:** `/health` endpoint for monitoring

### Security

- API key stored as Cloudflare secret (encrypted at rest)
- No authentication required for MCP clients (authless mode)
- API key never exposed to clients

## Development Notes

### Adding New Tools

To add a new Hevy API endpoint:

1. **Add the method to HevyClient** (`src/lib/client.ts`):
```typescript
async getNewEndpoint(options?: { param?: string }): Promise<any> {
  return this.get<any>('/v1/new_endpoint', options as Record<string, string | number | boolean | undefined>);
}
```

2. **Register the tool** in `src/index.ts` in the `init()` method:
```typescript
this.server.tool(
  "get_new_endpoint",
  {
    param: z.string().optional().describe("Parameter description"),
  },
  async ({ param }) => {
    try {
      const result = await this.client.getNewEndpoint({ param });

      return {
        content: [
          { type: "text", text: `Result: ${result.count}` },
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        }],
      };
    }
  }
);
```

3. Test locally with `npm start`
4. Deploy with `npm run deploy`

### File Watching

Wrangler automatically reloads on file changes during development.

## Migration from SSE to Streamable HTTP

This server has been migrated from Server-Sent Events (SSE) to streamable-http transport for better performance and future compatibility.

### What Changed

- **Primary endpoint**: `/sse` → `/mcp`
- **Transport**: SSE → streamable-http
- **SDK version**: 1.19.1 → 1.20.0
- **Session management**: Improved with better error handling

### For Existing Users

1. **Update your MCP client configuration**:
   - Change URL from `https://hevy-mcp-server.tom-7bc.workers.dev/sse` to `https://hevy-mcp-server.tom-7bc.workers.dev/mcp`
   - Add `Accept: application/json, text/event-stream` header if needed

2. **Legacy SSE endpoint**:
   - The `/sse` endpoint is still available for backward compatibility
   - However, it's deprecated and will be removed in future versions

3. **Health monitoring**:
   - New `/health` endpoint provides server status information

### Benefits of Streamable HTTP

- **Better Performance**: More efficient than SSE for MCP
- **Stateless Option**: Can run without Durable Objects if needed
- **Future-Proof**: SSE is being deprecated in MCP specification
- **Better Error Handling**: More robust connection management
- **Cloudflare Optimized**: Better suited for serverless environments

## Troubleshooting

### API Key Not Working

Check if secret is set:
```bash
npx wrangler secret list
```

If not listed, add it:
```bash
echo "your-api-key" | npx wrangler secret put HEVY_API_KEY
```

### Connection Issues

Verify server is running:
- Local: http://localhost:8787/mcp (streamable-http)
- Production: https://hevy-mcp-server.tom-7bc.workers.dev/mcp
- Health check: https://hevy-mcp-server.tom-7bc.workers.dev/health

Test with curl:
```bash
# Test health endpoint
curl https://hevy-mcp-server.tom-7bc.workers.dev/health

# Test MCP initialization
curl -X POST https://hevy-mcp-server.tom-7bc.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'
```

### Deployment Errors

Check worker status:
```bash
npx wrangler tail
```

View logs in Cloudflare dashboard:
https://dash.cloudflare.com/

## Resources

- [Hevy API Documentation](https://hevy.com/settings?developer)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare MCP Guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [mcp-remote adapter](https://www.npmjs.com/package/mcp-remote)

## License

This project is for personal use with the Hevy API.

## Maintainer

Tom (tom@uclab.eu)

## Version

2.1.1 - Bug Fix Release:
- 🐛 Fixed missing `index` and `title` fields in create_workout, update_workout, create_routine, and update_routine
- ✅ Auto-generate `index` fields for exercises and sets based on array position
- ✅ Added required `title` field to exercise schema (exercise name from template)
- 📝 Updated documentation to reflect exercise structure requirements

2.1.0 - Streamable HTTP Migration:
- ✅ Migrated from SSE to streamable-http transport (future-proof)
- ✅ Updated to @modelcontextprotocol/sdk@1.20.0
- ✅ Maintained backward compatibility with legacy SSE endpoint
- ✅ Added health check endpoint for monitoring
- ✅ Improved error handling and session management

2.0.0 - Expanded release with comprehensive Hevy API coverage:
- ✅ 10 total tools covering all major Hevy API endpoints
- ✅ Workouts: get, get by ID, create, count
- ✅ Routines: get, get by ID, create
- ✅ Exercise templates and history
- ✅ Routine folders
- ✅ Clean HevyClient abstraction for maintainability
