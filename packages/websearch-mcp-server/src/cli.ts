#!/usr/bin/env node

/**
 * CLI entry point for the websearch MCP server.
 *
 * Starts the MCP server on stdio transport, handling signals
 * and stdin close for graceful shutdown.
 */

import { createWebSearchServer } from './server.js';

const MCP_PKG = '@modelcontextprotocol/sdk';

async function main(): Promise<void> {
  const { server } = await createWebSearchServer();

  const { StdioServerTransport } = await import(`${MCP_PKG}/server/stdio.js`);
  const transport = new StdioServerTransport();

  // Cleanup handler
  let cleaningUp = false;
  async function cleanup(): Promise<void> {
    if (cleaningUp) return;
    cleaningUp = true;
    process.stderr.write('[gsd-websearch-mcp-server] Shutting down...\n');
    try {
      await server.close();
    } catch {
      // swallow close errors
    }
    process.exit(0);
  }

  process.on('SIGTERM', () => void cleanup());
  process.on('SIGINT', () => void cleanup());

  // Handle stdin end — MCP client disconnected
  process.stdin.on('end', () => void cleanup());

  // Connect and start serving
  try {
    await server.connect(transport);
    process.stderr.write('[gsd-websearch-mcp-server] MCP server started on stdio\n');
  } catch (err) {
    process.stderr.write(
      `[gsd-websearch-mcp-server] Fatal: failed to start — ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(
    `[gsd-websearch-mcp-server] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
