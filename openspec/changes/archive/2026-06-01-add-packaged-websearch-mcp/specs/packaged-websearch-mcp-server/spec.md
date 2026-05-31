## ADDED Requirements

### Requirement: Package structure follows monorepo conventions

The `packages/websearch-mcp-server/` SHALL follow the established monorepo package structure, including:
- `package.json` with `name: "@gsd/websearch-mcp-server"`, `type: "module"`, `bin` entry pointing to `dist/cli.js`, and `exports` map for `./server`, `./search-duckduckgo`, `./rate-limiter`
- `tsconfig.json` extending the monorepo root TypeScript configuration
- `src/server.ts` — MCP server setup with `StdioServerTransport` and tool registration
- `src/search-duckduckgo.ts` — DuckDuckGo HTML search implementation
- `src/rate-limiter.ts` — Sliding-window rate limiter
- `src/cli.ts` — CLI entry point
- `src/index.ts` — Public API exports

#### Scenario: Package metadata is correct

- **WHEN** the package is verified with `pnpm list --depth 0`
- **THEN** the package SHALL be listed as `@gsd/websearch-mcp-server` and the version SHALL match the monorepo root version

#### Scenario: Package can be built

- **WHEN** `tsc` is run in the package directory
- **THEN** the package SHALL compile successfully, producing `dist/server.js`, `dist/cli.js`, `dist/index.js`, `dist/search-duckduckgo.js`, and `dist/rate-limiter.js`

### Requirement: Server starts on stdio transport

The CLI entry point SHALL start the MCP server using `StdioServerTransport` from `@modelcontextprotocol/sdk` and advertise the server name `gsd-websearch` with the package version.

#### Scenario: Server starts without crashing

- **WHEN** the CLI is invoked (e.g., `node dist/cli.js`)
- **THEN** it SHALL begin listening on stdin/stdout for MCP JSON-RPC messages

#### Scenario: Server advertises correct capabilities

- **WHEN** the MCP client sends an `initialize` request
- **THEN** the server SHALL respond with `{ serverInfo: { name: "gsd-websearch", version: "<pkg-version>" }, capabilities: { tools: {} } }`

### Requirement: Graceful shutdown

The server SHALL handle `SIGTERM`, `SIGINT`, and stdin close by gracefully shutting down.

#### Scenario: Server shuts down on SIGTERM

- **WHEN** a `SIGTERM` signal is received
- **THEN** the server SHALL exit with code 0 within 2 seconds

#### Scenario: Server shuts down on stdin close

- **WHEN** the stdin stream ends (MCP client disconnected)
- **THEN** the server SHALL clean up and exit

### Requirement: Tool exposure via MCP

The server SHALL register and expose at least the following tools via MCP `tools/list`:
- `web_search` — perform web search queries via DuckDuckGo
- `web_search_fetch` — fetch content from a given URL

#### Scenario: Tools are listed

- **WHEN** an MCP client sends `tools/list`
- **THEN** the response SHALL include both `web_search` and `web_search_fetch` tools with descriptions and JSON Schema parameter definitions

### Requirement: Minimal runtime dependencies

The package SHALL only depend on:
- `@modelcontextprotocol/sdk` (already a dep in `packages/mcp-server/`)
- `cheerio` — HTML parsing for DuckDuckGo result extraction
- `zod` (already a dep in `packages/mcp-server/`)
- No external search SDKs — DuckDuckGo is queried via `fetch()` (built into Node.js 18+)

#### Scenario: Dependencies are minimal

- **WHEN** `pnpm ls --prod` is run in the package directory
- **THEN** the only production dependencies SHALL be `@modelcontextprotocol/sdk`, `cheerio`, and `zod`

### Requirement: DuckDuckGo search backend

The `src/search-duckduckgo.ts` module SHALL implement a DuckDuckGo HTML search client that:
- Sends HTTP POST requests to `https://html.duckduckgo.com/html` with form-encoded body `q={query}&kl=wt-wt`
- Sets headers: `User-Agent: Mozilla/5.0 (compatible; GSD-WebSearch-MCP/1.0)`, `Referer: https://duckduckgo.com/`, `Content-Type: application/x-www-form-urlencoded`
- Parses HTML response using cheerio, extracting result blocks matching `<a class="result__a">` (title), `<a class="result__url">` (URL), `<a class="result__snippet">` (snippet)
- Detects CAPTCHA pages by checking response content for CAPTCHA-related keywords
- Falls back to `https://lite.duckduckgo.com/lite` on CAPTCHA detection
- Supports optional form fields: `df` (date filter: d/w/m/y for day/week/month/year), `site:{domain}` injected into query
- Times out after 15 seconds per request

#### Scenario: Basic search query returns results

- **WHEN** a search for `"TypeScript 5"` is submitted
- **THEN** an array of result objects is returned with `title`, `url`, and `snippet` fields

#### Scenario: CAPTCHA detection triggers fallback

- **WHEN** the HTML endpoint returns a CAPTCHA page (detected by checking for "captcha" or "verify" in the response)
- **THEN** the module SHALL retry using the `lite.duckduckgo.com/lite` fallback endpoint

#### Scenario: No results returns empty array

- **WHEN** a search query returns no results from DuckDuckGo
- **THEN** an empty array SHALL be returned

#### Scenario: Network error is handled

- **WHEN** the DuckDuckGo endpoint is unreachable (DNS failure, connection refused)
- **THEN** the module SHALL throw a `WebSearchError` with kind `network_error`

### Requirement: Rate limiting is enforced

The server SHALL enforce a sliding-window rate limit of 1 request per second by default (configurable via `WEBSEARCH_RATE_LIMIT_RPM` env var) using the rate limiter module.

#### Scenario: Rate limit exceeded

- **WHEN** a search request arrives within 1 second of the previous request
- **THEN** the server SHALL return an MCP tool error with message `"Rate limited. Try again in {n} seconds."`

#### Scenario: Rate limit is configurable

- **WHEN** `WEBSEARCH_RATE_LIMIT_RPM=10` is set in the environment
- **THEN** the rate limit SHALL allow 10 requests per 60 seconds (1 request per 6 seconds)
