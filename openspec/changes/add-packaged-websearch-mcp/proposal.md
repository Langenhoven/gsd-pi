## Why

Currently, all web search capabilities in the project require the user to obtain and configure an API key from a third-party search provider (Brave, Tavily, Ollama, or Google — each requiring registration, a billing plan, and copying an API key). There is no built-in web search that works out-of-the-box. Users who want to search the web must leave the agent, sign up for a paid search API, copy a key, and configure it.

OpenCode ships with a packaged websearch MCP server that works without any external API key — it connects directly to Exa AI's free hosted MCP service with zero configuration. This project needs the same: a built-in web search that "just works" for any user, regardless of which model provider they use, without requiring them to sign up for a search API.

We need to ship an MCP-based web search tool that uses DuckDuckGo's free HTML search endpoint (no API key needed) as its default backend — while preserving the existing search providers (Brave, Tavily, Ollama, Google) as user-selectable alternatives for users who prefer them.

## What Changes

- **New package**: `packages/websearch-mcp-server/` — an independent MCP server that exposes `web_search` and `web_search_fetch` tools via stdio transport, following the same package pattern as `packages/mcp-server/`.
- **Free default backend via DuckDuckGo HTML**: The MCP server uses `https://html.duckduckgo.com/html` (HTTP POST, no-JS, no API key required) as its built-in search backend. Works out-of-the-box for every user.
- **Rate limiting**: The MCP server enforces a built-in rate limit of 1 request per second per process to protect against DuckDuckGo's bot detection and IP blocking. Rate limit is self-healing — a sliding window that resets after inactivity.
- **Search provider passthrough**: When a user has set `BRAVE_API_KEY`, `TAVILY_API_KEY`, `OLLAMA_API_KEY`, or `GEMINI_API_KEY`, the MCP server respects the existing `resolveSearchProvider()` preference and routes through the user's chosen provider instead.
- **Auto-registration**: The websearch MCP server is registered as a packaged MCP tool in the GSD runtime via a bundled extension, so coding agents can discover and invoke it without manual MCP client configuration.
- **No changes to provider registry**: DuckDuckGo does not require an API key, so no new entry is needed in `PROVIDER_REGISTRY`, `onboarding-service.ts`, or `tool-credentials.ts`. The existing search provider infrastructure is untouched.
- **Docs**: Quick-start and configuration documentation in `docs/user-docs/providers.md`, `docs/zh-CN/user-docs/providers.md`, and `gitbook/configuration/providers.md`.

## Capabilities

### New Capabilities
- `packaged-websearch-mcp-server`: The standalone MCP server package that exposes web search tools over stdio MCP transport, with DuckDuckGo HTML as its free default backend, rate limiting, and search-provider passthrough.
- `websearch-rate-limiting`: Built-in rate limiting that enforces safe request rates to DuckDuckGo, protects against IP blocking, and provides clear feedback when rate-limited.
- `auto-mcp-tool-registration`: Automatic registration of the websearch MCP server's tools so they appear in the coding agent's tool list without manual MCP client configuration.
- `mcp-tool-web-search`: The `web_search` tool definition and execution logic exposed over MCP, accepting query, count, freshness, and domain parameters, routing through DuckDuckGo or a configured alternative provider.
- `mcp-tool-web-search-fetch`: The `web_search_fetch` tool definition that retrieves full page content from a URL provided in search results, exposed over MCP.

### Modified Capabilities
*(No existing capability specs are changing — this is an entirely new feature set.)*

## Impact

| Category | Details |
|----------|---------|
| **New packages** | `packages/websearch-mcp-server/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/server.ts`, `src/cli.ts`, `src/search-provider.ts`, `src/rate-limiter.ts` — following the pattern in `packages/mcp-server/` |
| **New source files** | `src/resources/extensions/websearch-mcp/` — extension manifest and glue code for auto-registration |
| **Modified files** | `docs/user-docs/providers.md` — add section explaining the websearch MCP server |
| | `docs/zh-CN/user-docs/providers.md` — same |
| | `gitbook/configuration/providers.md` — same |
| **Dependencies added** | `@modelcontextprotocol/sdk` (already a dep of `packages/mcp-server/`) in the new package; DuckDuckGo search uses `fetch()` (built into Node.js 22+) — no external search SDK needed |
| **No changes to** | `src/resources/extensions/gsd/key-manager.ts`, `src/web/onboarding-service.ts`, `packages/mcp-server/src/tool-credentials.ts`, `src/wizard.ts`, `packages/pi-coding-agent/src/core/provider-display-names.ts` — no new providers to register since DuckDuckGo is free and keyless |
| | Existing `search-the-web` extension, native Anthropic search hooks, google-search extension, or `packages/mcp-server/` server logic |
