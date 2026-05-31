## 1. Scaffold Websearch MCP Server Package

- [x] 1.1 Create `packages/websearch-mcp-server/` directory structure: `src/`, plus `package.json` and `tsconfig.json` mirroring the conventions in `packages/mcp-server/`
- [x] 1.2 Write `packages/websearch-mcp-server/package.json` with `name: "@gsd/websearch-mcp-server"`, `type: "module"`, `bin: { "gsd-websearch-mcp-server": "./dist/cli.js" }`, `exports` map, and `dependencies: { @modelcontextprotocol/sdk, cheerio, zod }`
- [x] 1.3 Write `packages/websearch-mcp-server/tsconfig.json` extending root tsconfig with `compilerOptions.outDir: "./dist"` and `include: ["src"]`
- [x] 1.4 Register the new package in the monorepo's `pnpm-workspace.yaml`
- [x] 1.5 Run `pnpm install` from root to install cheerio and register the new workspace package

## 2. Implement Rate Limiter

- [x] 2.1 Create `packages/websearch-mcp-server/src/rate-limiter.ts` — export `RateLimiter` class with:
  - Constructor accepting `maxRequests` and `windowMs` (defaults: 1 request per 1000ms)
  - `check()` method returning `{ allowed: boolean, retryAfterMs?: number }`
  - `isApproachingLimit()` method returning `true` when >75% of window consumed
  - `reset()` method to clear the window
  - Sliding-window algorithm: maintain `timestamps: number[]`, remove entries older than `windowMs` on each check
  - Read `WEBSEARCH_RATE_LIMIT_RPM` env var in constructor for configurable limit
- [x] 2.2 Write unit tests for `RateLimiter` covering: single request allowed, rapid requests rejected, window expiry, approaching-limit threshold, configurable RPM, and memory bounds

## 3. Implement DuckDuckGo Search Client

- [x] 3.1 Create `packages/websearch-mcp-server/src/search-duckduckgo.ts` — export `searchDuckDuckGo(query, options)` function:
  - Sends `POST https://html.duckduckgo.com/html` with form body `q={query}&kl=wt-wt`
  - Sets headers: `User-Agent: Mozilla/5.0 ...`, `Referer: https://duckduckgo.com/`, `Content-Type: application/x-www-form-urlencoded`
  - Supports optional `df` form field for freshness (d/w/m/y)
  - Supports `site:domain` prepended to query when `site` option provided
  - Parses HTML using cheerio, extracting `.result__a` (title), `.result__url` (url), `.result__snippet` (snippet)
  - Detects CAPTCHA response (check for "captcha" or "verify" keywords in HTML)
  - Falls back to `GET https://lite.duckduckgo.com/lite` on CAPTCHA detection
  - Throws typed `WebSearchError` for network errors, empty results, invalid queries
  - Returns `SearchResult[]` with `{ title, url, snippet }` fields
- [x] 3.2 Write unit tests for DuckDuckGo search client covering: search returns results, empty query handling, site filter injection, freshness parameter passthrough, CAPTCHA fallback detection logic, network error propagation

## 4. Implement MCP Server Core

- [x] 4.1 Create `packages/websearch-mcp-server/src/server.ts` — MCP server setup using `@modelcontextprotocol/sdk` `McpServer`:
  - Register `web_search` tool with Zod schema: `query` (string, required), `count` (number, optional 1–20, default 10), `freshness` (enum optional: day/week/month/year), `site` (string optional)
  - Register `web_search_fetch` tool with Zod schema: `url` (string, required), `max_content_length` (number, optional 500–100000, default 10000)
  - Before each `web_search` call, check `RateLimiter.check()`; if rate-limited, return MCP error with `errorKind: "rate_limited"` and `retryAfterMs`
  - After each successful `web_search` call, check `RateLimiter.isApproachingLimit()` and append warning text if true
  - Server name: `gsd-websearch`, version from package.json
  - Graceful shutdown on SIGTERM, SIGINT, stdin close
- [x] 4.2 Create `packages/websearch-mcp-server/src/cli.ts` — CLI entry point:
  - Instantiate `Server` with `StdioServerTransport`
  - Handle process signals for clean shutdown
- [x] 4.3 Create `packages/websearch-mcp-server/src/index.ts` — re-export all public types and classes

## 5. Create Auto-Registration Extension

- [x] 5.1 Create `src/resources/extensions/websearch-mcp/extension-manifest.json` with `{ id: "websearch-mcp", name: "WebSearch MCP", tier: "bundled" }`
- [x] 5.2 Create `src/resources/extensions/websearch-mcp/index.ts` — extension default export:
  - Register MCP server config (command: resolved path to `gsd-websearch-mcp-server`, env: `{ WEBSEARCH_RATE_LIMIT_RPM }`)
  - Implement lazy activation: MCP server spawns on first tool call, not at session start
  - Implement `model_select` hook: when provider is `anthropic` and native search is available, hide `web_search` and `web_search_fetch` from active tools
  - On session shutdown: terminate MCP server child process with SIGTERM

## 6. Wire Build System

- [x] 6.1 Add `packages/websearch-mcp-server` to the `build:core` script chain in root `package.json`
- [x] 6.2 Verify the package compiles: run `npm run build:core` and confirm `dist/` output exists for the new package
- [x] 6.3 Add basic smoke test: `packages/websearch-mcp-server/src/__tests__/server.test.ts` — tests that tools are registered with the correct names and schemas

## 7. Update Documentation

- [x] 7.1 Add a "WebSearch MCP Server" section to `docs/user-docs/providers.md` explaining:
  - The websearch MCP server provides free DuckDuckGo-backed search — no API key required
  - How it differs from the existing search providers (Brave, Tavily, etc.)
  - Rate limit: 1 request/second by default, configurable via `WEBSEARCH_RATE_LIMIT_RPM`
  - That existing search providers remain available and unchanged
- [x] 7.2 Add the same section to `docs/zh-CN/user-docs/providers.md`
- [x] 7.3 Add the same section to `gitbook/configuration/providers.md`

## 8. Verification

- [ ] 8.1 Verify `web_search` tool works end-to-end: start the MCP server, send a `tools/call` request for `web_search` with query "TypeScript 5", and confirm results are returned as structured content with `title`, `url`, and `snippet`
- [ ] 8.2 Verify `web_search` rate limiting: send 2 search requests in rapid succession (within 1 second), confirm the second returns `errorKind: "rate_limited"` with `retryAfterMs`
- [ ] 8.3 Verify `web_search_fetch` tool: call it with a known URL (e.g., `example.com`), confirm readable content is returned with `content`, `contentType`, `contentLength`
- [ ] 8.4 Verify `web_search_fetch` content truncation: call with `max_content_length: 500` on a page longer than 500 chars, confirm `truncated: true`
- [ ] 8.5 Verify tool registration: confirm `web_search` and `web_search_fetch` appear in the MCP server's `tools/list` response with correct schemas
- [ ] 8.6 Verify native search awareness: configure an Anthropic provider, confirm MCP `web_search` is hidden when native search is active; switch to OpenAI, confirm tools reappear
- [ ] 8.7 Verify existing search providers are untouched: confirm `search-the-web` extension tools remain functional with Brave/Tavily/Ollama keys
- [ ] 8.8 Verify no credential leaks: confirm the MCP server does NOT require or check for any API keys in environment variables
