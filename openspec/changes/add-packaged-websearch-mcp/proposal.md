## Why

Currently, all web search capabilities in the project require the user to obtain and configure an API key from a third-party search provider (Brave, Tavily, Ollama, or Google — each requiring registration, a billing plan, and an API key). There is no built-in web search path that works out-of-the-box. Users who want to search the web must leave the agent, sign up for a paid search API, copy a key, and configure it. This friction is the single biggest gap compared to OpenCode, which ships with a packaged websearch MCP server that works without external search API keys.

We need to ship an MCP-based web search tool that uses the OpenCode API (already supported via `OPENCODE_API_KEY`) as its default search backend — and provide a graceful fallback when no API key is configured — while preserving the existing search providers (Brave, Tavily, Ollama, Google) as user-selectable alternatives.

## What Changes

- **New package**: `packages/websearch-mcp-server/` — an independent MCP server that exposes `web_search` and `web_search_fetch` tools via stdio transport, following the same package pattern as `packages/mcp-server/`.
- **Default search backend via OpenCode API**: The MCP server uses OpenCode's backend infrastructure for web search, leveraging the existing `OPENCODE_API_KEY` credential when available. This gives users who have configured OpenCode (either Zen or Go) a working web search with zero additional setup.
- **Free fallback mode**: When `OPENCODE_API_KEY` is not set, the MCP server falls back to a rate-limited built-in search mechanism (e.g., DuckDuckGo light scraping or a bundled lightweight search client) so the agent can search the web even without any API key.
- **Search provider passthrough**: When a user has set `BRAVE_API_KEY`, `TAVILY_API_KEY`, `OLLAMA_API_KEY`, or `GEMINI_API_KEY`, the MCP server respects the existing `resolveSearchProvider()` preference and routes through the user's chosen provider instead.
- **New provider entry**: Add `opencode-search` to `PROVIDER_REGISTRY` in `src/resources/extensions/gsd/key-manager.ts` as a search provider, enabling key management and validation via `/gsd keys`.
- **Auto-registration**: The websearch MCP server is auto-registered as a packaged MCP tool in the GSD runtime so coding agents can discover and invoke it without manual MCP client configuration.
- **Docs**: Quick-start and configuration documentation in `docs/user-docs/providers.md`, `docs/zh-CN/user-docs/providers.md`, and `gitbook/configuration/providers.md`.

## Capabilities

### New Capabilities
- `packaged-websearch-mcp-server`: The standalone MCP server package that exposes web search tools over stdio MCP transport, with OpenCode API default backend, free fallback, and search-provider passthrough.
- `opencode-search-provider`: Registration of `opencode-search` as a first-class search provider in the provider registry, key manager, onboarding wizard, and env-hydration pipeline.
- `auto-mcp-tool-registration`: Automatic registration of the websearch MCP server's tools so they appear in the coding agent's tool list without manual MCP client configuration.
- `mcp-tool-web-search`: The `web_search` tool definition and execution logic exposed over MCP, accepting query, count, freshness, and domain parameters.
- `mcp-tool-web-search-fetch`: The `web_search_fetch` tool definition that retrieves full page content from a URL provided in search results, exposed over MCP.

### Modified Capabilities
*(No existing capability specs are changing — this is an entirely new feature set.)*

## Impact

| Category | Details |
|----------|---------|
| **New packages** | `packages/websearch-mcp-server/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/server.ts`, `src/cli.ts` — following the pattern in `packages/mcp-server/` |
| **New source files** | `src/resources/extensions/websearch-mcp/` — extension manifest and glue code for auto-registration |
| **Modified files** | `src/resources/extensions/gsd/key-manager.ts` — add `opencode-search` to `PROVIDER_REGISTRY` and `TEST_ENDPOINTS` |
| | `src/web/onboarding-service.ts` — add `opencode-search` to `OPTIONAL_SECTION_CATALOG` under `web_search` providers |
| | `packages/mcp-server/src/tool-credentials.ts` — add `opencode-search` → `OPENCODE_API_KEY` mapping |
| | `src/wizard.ts` — add `opencode-search` to `loadStoredEnvKeys` if needed |
| | `packages/pi-coding-agent/src/core/provider-display-names.ts` — add `opencode-search` display name |
| | `docs/user-docs/providers.md`, `docs/zh-CN/user-docs/providers.md`, `gitbook/configuration/providers.md` — add setup section for the new MCP server |
| **Dependencies added** | `@modelcontextprotocol/sdk` (already a dep of `packages/mcp-server/`) in the new package; no new runtime deps beyond what the project already uses |
| **No changes to** | Existing `search-the-web` extension, native Anthropic search hooks, google-search extension, or `packages/mcp-server/` server logic |
