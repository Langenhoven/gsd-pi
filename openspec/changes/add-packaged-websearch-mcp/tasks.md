## 1. Scaffold Websearch MCP Server Package

- [ ] 1.1 Create `packages/websearch-mcp-server/` directory structure: `src/`, `bin/`, plus `package.json`, `tsconfig.json`, and `tsconfig.test.json` mirroring the conventions in `packages/mcp-server/`
- [ ] 1.2 Write `packages/websearch-mcp-server/package.json` with `name: "@opengsd/websearch-mcp-server"`, `type: "module"`, `bin: { "gsd-websearch-mcp-server": "./bin/gsd-websearch-mcp-server.js" }`, `exports` map, and `dependencies: { @modelcontextprotocol/sdk, zod }`
- [ ] 1.3 Write `packages/websearch-mcp-server/tsconfig.json` extending root tsconfig with `compilerOptions.outDir: "./dist"` and `include: ["src"]`
- [ ] 1.4 Write `packages/websearch-mcp-server/bin/gsd-websearch-mcp-server.js` — a CLI shim that imports and runs `../dist/cli.js`
- [ ] 1.5 Register the new package in the monorepo's `pnpm-workspace.yaml` so `pnpm install` picks it up
- [ ] 1.6 Run `pnpm install` from root to register the new workspace package

## 2. Implement MCP Server Core (packages/websearch-mcp-server/src/)

- [ ] 2.1 Create `packages/websearch-mcp-server/src/constants.ts` — export `SERVER_NAME = "gsd-websearch"`, `OPENCODE_SEARCH_ENDPOINT`, `FREE_FALLBACK_RATE_LIMIT = 10`, `FREE_FALLBACK_WINDOW_MS = 3600000`, and `MAX_FETCH_BYTES = 100000`
- [ ] 2.2 Create `packages/websearch-mcp-server/src/search-provider.ts` — a module that imports `resolveSearchProvider` from `src/resources/extensions/search-the-web/provider.ts` and adds OpenCode API detection (checks `process.env.OPENCODE_API_KEY`), returning `"opencode"` when available
- [ ] 2.3 Create `packages/websearch-mcp-server/src/backends/opencode.ts` — search execution against OpenCode's search endpoint using `OPENCODE_API_KEY`, normalizing results into the common format (`{ title, url, description, age }[]`)
- [ ] 2.4 Create `packages/websearch-mcp-server/src/backends/brave.ts` — search execution against Brave API (reusing URL construction pattern from `tool-search.ts:512-523`), normalizing results
- [ ] 2.5 Create `packages/websearch-mcp-server/src/backends/tavily.ts` — search execution against Tavily API, including freshness mapping (reusing from `tool-search.ts:204-251`)
- [ ] 2.6 Create `packages/websearch-mcp-server/src/backends/free.ts` — rate-limited free search fallback using a lightweight approach (e.g., DuckDuckGo Lite or equivalent), with in-memory rate-limit tracking
- [ ] 2.7 Create `packages/websearch-mcp-server/src/content-fetcher.ts` — `fetchPageContent(url)` function that fetches a URL, detects content type, extracts text from HTML, follows redirects, and handles HTTP errors
- [ ] 2.8 Create `packages/websearch-mcp-server/src/result-formatter.ts` — utilities for formatting search results, deduplication, and truncation, mirroring `format.ts` from `search-the-web/`
- [ ] 2.9 Create `packages/websearch-mcp-server/src/server.ts` — MCP server setup using `@modelcontextprotocol/sdk` `McpServer`, registering `web_search` and `web_search_fetch` tools with Zod schema parameters
- [ ] 2.10 Create `packages/websearch-mcp-server/src/cli.ts` — stdio transport entry point that loads credentials via `loadStoredCredentialEnvKeys`, creates the server, connects to `StdioServerTransport`, and handles SIGTERM/SIGINT/cleanup (following pattern from `packages/mcp-server/src/cli.ts`)
- [ ] 2.11 Create `packages/websearch-mcp-server/src/index.ts` — public API exports mirroring `packages/mcp-server/src/index.ts`

## 3. Add opencode-search to Provider Registry

- [ ] 3.1 Add `{ id: "opencode-search", label: "OpenCode Search", category: "search", envVar: "OPENCODE_API_KEY", dashboardUrl: "opencode.ai/auth" }` to `PROVIDER_REGISTRY` in `src/resources/extensions/gsd/key-manager.ts`
- [ ] 3.2 Add `"opencode-search"` → `OPENCODE_API_KEY` mapping to `AUTH_ENV_KEYS` in `packages/mcp-server/src/tool-credentials.ts`
- [ ] 3.3 Add `"opencode-search"` → display name "OpenCode Search" in `packages/pi-coding-agent/src/core/provider-display-names.ts`
- [ ] 3.4 Add `opencode-search` to `OPTIONAL_SECTION_CATALOG` in `src/web/onboarding-service.ts` under the `web_search` section
- [ ] 3.5 Add `opencode-search` endpoint test to `TEST_ENDPOINTS` in `key-manager.ts` for API key validation
- [ ] 3.6 Add `opencode-search` to `loadStoredEnvKeys` in `src/wizard.ts` if the mapping isn't already handled by the shared `OPENCODE_API_KEY` env var

## 4. Create Auto-Registration Extension

- [ ] 4.1 Create `src/resources/extensions/websearch-mcp/extension-manifest.json` with `{ id: "websearch-mcp", name: "WebSearch MCP", tier: "bundled", provides: { tools: ["web_search", "web_search_fetch"] } }`
- [ ] 4.2 Create `src/resources/extensions/websearch-mcp/index.ts` — extension default export that registers `session_start` and `session_shutdown` hooks, manages the websearch MCP server child process lifecycle, and wires tool visibility to provider selection
- [ ] 4.3 In `index.ts`, implement the `model_select` hook that checks for active native Anthropic search (calling `supportsNativeWebSearch()` from `native-search.ts`) and toggles MCP tool visibility accordingly
- [ ] 4.4 In `index.ts`, implement the `model_select` hook that checks for active `search-the-web` tools (Brave/Tavily/Ollama configured) and toggles MCP tool visibility accordingly
- [ ] 4.5 In `index.ts`, implement lazy server startup: spawn the `gsd-websearch-mcp-server` process only when `web_search` or `web_search_fetch` is first called, using the GSD CLI path resolution

## 5. Wire Build System

- [ ] 5.1 Add `packages/websearch-mcp-server` to the `build:core` script chain in root `package.json` (after `packages/mcp-server`)
- [ ] 5.2 Verify the package compiles: run `npm run build:core` and confirm `dist/` output exists for the new package
- [ ] 5.3 Add basic test files for the search backends: `packages/websearch-mcp-server/src/__tests__/backends.test.ts`

## 6. Update Documentation

- [ ] 6.1 Add a "WebSearch MCP Server" section to `docs/user-docs/providers.md` explaining the default OpenCode search, free fallback, and configuration for alternative search providers
- [ ] 6.2 Add the same section to `docs/zh-CN/user-docs/providers.md`
- [ ] 6.3 Add the same section to `gitbook/configuration/providers.md`
- [ ] 6.4 Add a "Web Search via MCP" page or section to `docs/user-docs/` explaining how to use the `web_search` and `web_search_fetch` MCP tools and how they relate to the existing search tools

## 7. Verification

- [ ] 7.1 Verify the `web_search` MCP tool works end-to-end: start the MCP server, send a `tools/call` request for `web_search` with a test query, and confirm results are returned as structured content
- [ ] 7.2 Verify `web_search_fetch` tool: call it with a known URL and confirm readable content is returned
- [ ] 7.3 Verify search provider passthrough: set `BRAVE_API_KEY`, call `web_search`, and confirm results come from Brave
- [ ] 7.4 Verify OpenCode search backend: set `OPENCODE_API_KEY`, call `web_search`, and confirm it routes through OpenCode
- [ ] 7.5 Verify free fallback: unset all API keys, call `web_search`, and confirm results are returned with `provider: "free"` label
- [ ] 7.6 Verify free fallback rate limit: call `web_search` 11+ times and confirm the 11th returns a rate-limit error
- [ ] 7.7 Verify tool registration: check that `web_search` and `web_search_fetch` appear in the MCP server's `tools/list` response
- [ ] 7.8 Verify native search awareness: configure an Anthropic provider and confirm MCP `web_search` is hidden when native search is active
- [ ] 7.9 Verify `opencode-search` appears in `/gsd keys` dashboard under "Search Providers"
- [ ] 7.10 Verify `opencode-search` appears in the web onboarding wizard under "Web search" section
