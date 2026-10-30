// Worker entry point: the Hono app handles every route, including the
// stateless MCP endpoint. No Durable Objects are exported.
import app from "./app.js";
export default app;
