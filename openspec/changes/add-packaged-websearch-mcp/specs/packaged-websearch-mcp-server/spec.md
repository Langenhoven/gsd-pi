## ADDED Requirements

### Requirement: Package structure mirrors existing MCP server pattern

The `packages/websearch-mcp-server/` SHALL follow the same package structure as `packages/mcp-server/` for consistency, including:
- `package.json` with `name: "@opengsd/websearch-mcp-server"`, `type: "module"`, `bin` entry point, and `exports` map
- `tsconfig.json` referencing the monorepo's TypeScript config conventions
- `src/server.ts` — MCP server setup with tool registration
- `src/cli.ts` — stdio transport entry point
- `src/index.ts` — public API exports
- `bin/gsd-websearch-mcp-server.js` — CLI shim

#### Scenario: Package metadata is correct

- **WHEN** the package is published with `npm pack`
- **THEN** the package name SHALL be `@opengsd/websearch-mcp-server` and the version SHALL match the monorepo root version

#### Scenario: Package can be built

- **WHEN** `npm run build:core` runs from the monorepo root
- **THEN** the package SHALL compile successfully with `tsc`, producing `dist/server.js`, `dist/cli.js`, and `dist/index.js`

### Requirement: Server starts on stdio transport

The CLI entry point (`bin/gsd-websearch-mcp-server.js`) SHALL start the MCP server using `StdioServerTransport` from `@modelcontextprotocol/sdk` and advertise the server name `gsd-websearch` with the package version.

#### Scenario: Server starts without crashing

- **WHEN** the CLI is invoked (e.g., `node dist/cli.js`)
- **THEN** it SHALL write a startup message to stderr and begin listening on stdin/stdout for MCP JSON-RPC messages

#### Scenario: Server advertises correct capabilities

- **WHEN** the MCP client sends an `initialize` request
- **THEN** the server SHALL respond with `{ serverInfo: { name: "gsd-websearch", version: "<pkg-version>" }, capabilities: { tools: {} } }`

### Requirement: Graceful shutdown

The server SHALL handle `SIGTERM`, `SIGINT`, and stdin close by gracefully shutting down, flushing any in-flight requests.

#### Scenario: Server shuts down on SIGTERM

- **WHEN** a `SIGTERM` signal is received
- **THEN** the server SHALL exit with code 0

#### Scenario: Server shuts down on stdin close

- **WHEN** the stdin stream ends (MCP client disconnected)
- **THEN** the server SHALL clean up and exit

### Requirement: Tool exposure via MCP

The server SHALL register and expose at least the following tools via MCP `tools/list`:
- `web_search` — perform web search queries
- `web_search_fetch` — fetch content from a given URL

#### Scenario: Tools are listed

- **WHEN** an MCP client sends `tools/list`
- **THEN** the response SHALL include both `web_search` and `web_search_fetch` tools with descriptions and JSON Schema parameters

### Requirement: No new runtime dependencies beyond what the project already uses

The package SHALL only depend on:
- `@modelcontextprotocol/sdk` (already a dep in `packages/mcp-server/`)
- `zod` (already a dep in `packages/mcp-server/`)
- No external search SDKs — all search backends are invoked via `fetch()` (built into Node.js 22+)

#### Scenario: Dependencies are minimal

- **WHEN** `npm ls --prod` is run in the package directory
- **THEN** the only production dependencies SHALL be `@modelcontextprotocol/sdk` and `zod`
