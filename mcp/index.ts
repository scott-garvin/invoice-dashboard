import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { sourceFromEnv } from "./source.js";
// stdout belongs exclusively to MCP. No credentials or records are logged.
try {
  await createMcpServer(sourceFromEnv(process.env)).connect(
    new StdioServerTransport(),
  );
} catch {
  console.error(
    "MCP could not start. Check the documented mode and configuration.",
  );
  process.exitCode = 1;
}
