import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "mcp/index.ts"],
  env: { MCP_MODE: "sample", PATH: process.env.PATH || "" },
});
const client = new Client({ name: "ledgerly-demo-client", version: "1.0.0" });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(
    "Discovered tools:",
    tools.tools.map((t) => t.name),
  );
  for (const name of ["list_invoices", "summarize_receivables"]) {
    const result = await client.callTool({ name, arguments: {} });
    if (result.isError) throw Error("Demo tool failed.");
    console.log(name, JSON.stringify(result.structuredContent, null, 2));
  }
} finally {
  await client.close();
}
