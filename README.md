# Hevy Fitness MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with access to the [Hevy](https://www.hevyapp.com/) fitness tracking API. This allows you to log workouts, manage routines, browse exercises, and track your fitness progress directly through AI chat interfaces.

## 🏋️ Features

This MCP server provides comprehensive access to Hevy's fitness tracking capabilities:

### Workouts
- **`get_workouts`** - Browse your workout history (paginated)
- **`get_workout`** - Get detailed information about a specific workout
- **`create_workout`** - Log a new workout with exercises, sets, weights, and reps
- **`update_workout`** - Update an existing workout
- **`get_workouts_count`** - Get total number of workouts logged
- **`get_workout_events`** - Get workout change events (updates/deletes) since a date for syncing

### Routines
- **`get_routines`** - List your workout routines
- **`get_routine`** - Get details of a specific routine
- **`create_routine`** - Create a new workout routine template
- **`update_routine`** - Update an existing routine

### Exercises
- **`get_exercise_templates`** - Browse available exercises (includes both Hevy's library and your custom exercises)
- **`get_exercise_template`** - Get detailed information about a specific exercise template
- **`create_exercise_template`** - Create a custom exercise template
- **`get_exercise_history`** - View your performance history for a specific exercise

### Organization
- **`get_routine_folders`** - List your routine folders for organization
- **`get_routine_folder`** - Get details of a specific routine folder
- **`create_routine_folder`** - Create a new routine folder

## 🚀 Quick Start

### Prerequisites

1. **Hevy Pro subscription** - The Hevy API is only available to Pro users
2. **Hevy API Key** - Get yours at https://hevy.com/settings?developer
3. **Cloudflare account** - For deploying the MCP server

### Deploy to Cloudflare Workers

1. Clone this repository:
```bash
git clone https://github.com/tomtorggler/hevy-mcp-server.git
cd hevy-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Set your Hevy API key as a secret:
```bash
npx wrangler secret put HEVY_API_KEY
# Paste your API key when prompted
```

4. Deploy to Cloudflare:
```bash
npm run deploy
```

Your MCP server will be available at: `https://hevy-mcp-server.<your-account>.workers.dev/mcp`

### Local Development

Run the server locally:
```bash
npm run dev
```

The server will be available at: `http://localhost:8787/mcp`

## 🔌 Connect to AI Clients

### Claude Desktop

To connect from Claude Desktop, edit your config file (Settings > Developer > Edit Config):

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://hevy-mcp-server.<your-account>.workers.dev/mcp"
      ]
    }
  }
}
```

Restart Claude Desktop and you'll see the Hevy tools available.

### Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL
3. Start using Hevy tools directly from the playground!

## 📖 Usage Examples

### Creating a Workout

Once connected, you can ask your AI assistant to log workouts:

> "Log a workout from today at 10am to 11am. I did bench press: 3 sets of 100kg for 10 reps, and squats: 4 sets of 120kg for 8 reps."

The assistant will:
1. Use `get_exercise_templates` to find the exercise IDs
2. Call `create_workout` with the proper structure
3. Confirm the workout was logged successfully

### Viewing Progress

> "Show me my last 5 workouts"

> "What's my exercise history for deadlifts?"

> "Get all workout changes since January 1st, 2024"

The assistant will use `get_workout_events` to sync recent changes.

### Managing Routines

> "Create a new Push Day routine with bench press (4 sets of 8-12 reps at 100kg) and overhead press (3 sets of 10 reps at 60kg)"

The assistant will use the `repRange` field for exercises with rep ranges like "8-12 reps".

> "Update my Upper Body routine to add pull-ups"

The assistant will use `update_routine` to modify existing routines.

### Creating Custom Exercises

> "Create a custom exercise called 'Tom's Special Cable Flyes' for chest using the cable machine"

The assistant will use `create_exercise_template` with the appropriate muscle groups and equipment category.

### Organizing Routines

> "Create a new folder called 'Summer 2024 Programs'"

The assistant will use `create_routine_folder` to organize your routines.

## 🔧 API Details

### Workout Structure

When creating workouts, you can specify:
- `title` - Name of the workout (required)
- `startTime` - When the workout started (required, ISO 8601 format)
- `endTime` - When the workout ended (required, ISO 8601 format)
- `routineId` - Optional routine ID this workout belongs to
- `description` - Optional workout description
- `isPrivate` - Whether the workout is private (optional, default: false)
- `exercises` - Array of exercises, each with:
  - `title` - Exercise name from the template (required)
  - `exerciseTemplateId` - Get this from `get_exercise_templates` (required)
  - `supersetId` - Optional superset ID (null if not in a superset)
  - `notes` - Optional notes for this exercise
  - `sets` - Array of set data with:
    - `type` - "warmup", "normal", "failure", or "dropset" (optional)
    - `weightKg` - Weight in kilograms (optional)
    - `reps` - Number of repetitions (optional)
    - `distanceMeters` - For cardio exercises (optional)
    - `durationSeconds` - For timed exercises (optional)
    - `customMetric` - Custom metric for steps/floors (optional)
    - `rpe` - Rating of Perceived Exertion, 6-10 (optional)

**Note:** The `index` field for exercises and sets is automatically generated based on their position in the array.

### Routine Structure

When creating routines, you can specify:
- `title` - Name of the routine (required)
- `folderId` - Optional folder ID (null for default "My Routines" folder)
- `notes` - Optional notes for the routine
- `exercises` - Array of exercises, each with:
  - `exerciseTemplateId` - Get this from `get_exercise_templates` (required)
  - `supersetId` - Optional superset ID (null if not in a superset)
  - `restSeconds` - Rest time in seconds between sets (optional)
  - `notes` - Optional notes for this exercise
  - `sets` - Array of set data with:
    - `type` - "warmup", "normal", "failure", or "dropset" (optional)
    - `weightKg` - Weight in kilograms (optional)
    - `reps` - Number of repetitions (optional)
    - `repRange` - Rep range object with `start` and `end` (optional, e.g., 8-12 reps)
    - `distanceMeters` - For cardio exercises (optional)
    - `durationSeconds` - For timed exercises (optional)
    - `customMetric` - Custom metric for steps/floors (optional)

**Important:** Unlike workouts, routines do NOT use `index` or `title` fields in exercises/sets. These are generated by the API.

### Time Format

All timestamps use ISO 8601 format:
```
2024-10-15T10:00:00Z
```

## 📚 Resources

- [Hevy API Documentation](https://api.hevyapp.com/docs) - Official API docs
- [MCP Documentation](https://modelcontextprotocol.io/) - Learn about Model Context Protocol
- [Hevy App](https://www.hevyapp.com/) - The Hevy fitness tracking app

## 🛠️ Development

### Project Structure

```
hevy-mcp-server/
├── src/
│   ├── index.ts          # MCP server implementation with tool definitions
│   └── lib/
│       └── client.ts     # Hevy API client wrapper
├── api.json              # OpenAPI specification for Hevy API
├── wrangler.jsonc        # Cloudflare Workers configuration
└── package.json
```

### Adding New Tools

To add new Hevy API capabilities:

1. Add the API method to `src/lib/client.ts`
2. Define the tool in `src/index.ts` inside the `init()` method
3. Use Zod for input validation
4. Handle errors gracefully

Example:
```typescript
this.server.tool(
  "tool_name",
  {
    param: z.string().describe("Parameter description"),
  },
  async ({ param }) => {
    try {
      const result = await this.client.someMethod(param);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }
);
```

## 🤝 Contributing

Contributions are welcome!

### How to Contribute

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** - add features, fix bugs, or improve documentation
3. **Test your changes** - run `npm test` and `npm run type-check`
4. **Follow the code style** - run `npm run format` and `npm run lint:fix`
5. **Submit a Pull Request** with a clear description of your changes

### Development Setup

```bash
# Clone your fork
git clone https://github.com/tomtorggler/hevy-mcp-server.git
cd hevy-mcp-server

# Install dependencies
npm install

# Copy environment variables template
cp .dev.vars.example .dev.vars
# Add your Hevy API key to .dev.vars

# Start development server
npm start

# Run tests
npm test
```

### Areas for Contribution

- Add more Hevy API endpoints
- Improve error handling and validation
- Add more comprehensive tests
- Improve documentation and examples
- Report bugs or suggest features via Issues

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

This project is not affiliated with Hevy. Hevy is a trademark of Hevy Studios Inc.
