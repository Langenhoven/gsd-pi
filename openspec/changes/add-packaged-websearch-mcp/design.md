## Context

The project currently ships three separate web search mechanisms:

1. **`search-the-web` extension** (`src/resources/extensions/search-the-web/`) — A bundled GSD extension providing `search-the-web`, `fetch_page`, and `search_and_read` tools. Backed by Brave (via `BRAVE_API_KEY`), Tavily (`TAVILY_API_KEY`), or Ollama (`OLLAMA_API_KEY`). Provider resolution logic lives in `provider.ts` and checks env vars + user preferences stored in `auth.json`.

2. **`google-search` extension** (`extensions/google-search/`) — An optional bundled extension providing `google_search` via Gemini's Google Search grounding. Requires `GEMINI_API_KEY` or Google Cloud OAuth. Registered as a GSD extension via `pi.registerTool()`.

3. **Native Anthropic web search** (`src/resources/extensions/search-the-web/native-search.ts`) — Injects the Anthropic `web_search_20250305` server-side tool for Anthropic Messages API requests. Only works with `anthropic`, `claude-code`, `anthropic-vertex`, and `vercel-ai-gateway` providers. Not available for non-Anthropic models.

All three require either a paid third-party API key or an Anthropic-native model. There is no web search option that works with any model provider (e.g., OpenAI, OpenRouter, Groq, OpenCode) without additional API key setup.

The existing `packages/mcp-server/` exposes GSD orchestration tools over MCP stdio transport but has no search capability. Its package structure (`package.json`, `src/server.ts`, `src/cli.ts`, `tsconfig.json`) serves as the reference pattern for the new package.

The `OPENCODE_API_KEY` credential is already a first-class citizen in the provider registry (`key-manager.ts:64-65`), env-var mapping (`env-api-keys.ts`), credential loading (`tool-credentials.ts:29-30`), and wizard hydration (`src/wizard.ts`). The OpenCode API provides access to models, and likely provides a bundled web search endpoint accessible through the same API key.

## Goals / Non-Goals

**Goals:**

- Ship a `packages/websearch-mcp-server/` package exposing `web_search` and `web_search_fetch` MCP tools that work out-of-the-box without requiring the user to provide any search-specific API key.
- Use the existing `OPENCODE_API_KEY` as the default search backend — users who already configured OpenCode get web search for free.
- Provide a rate-limited free fallback when no API key is set, so the agent can still search the web.
- Respect existing search-provider preferences (Brave, Tavily, Ollama, Google) when the user has configured those instead — the MCP server acts as a unified router.
- Register `opencode-search` as a first-class search provider in the provider registry, `/gsd keys` dashboard, and web onboarding wizard so users can validate and manage the key.
- Auto-register the websearch MCP server's tools in the GSD runtime so they appear to coding agents without manual MCP client configuration.

**Non-Goals:**

- Replacing or modifying the existing `search-the-web` extension, `google-search` extension, or native Anthropic search hooks. These continue to operate independently.
- Adding web search to the existing `packages/mcp-server/` — that server is for GSD project state/orchestration and has a distinct concern boundary.
- Supporting search result caching across MCP sessions — caching is handled within each request.
- Supporting authenticated search operations beyond what the OpenCode API provides — this is a built-in MCP tool, not a search provider management UI.

## Decisions

### D001: New `packages/websearch-mcp-server/` instead of adding to existing `packages/mcp-server/`

**Decision**: Create a new package rather than adding search tools to the existing MCP server.

**Rationale**:
- The existing `packages/mcp-server/` (server.ts:927-937) is scoped to GSD project state and orchestration — session tools, project readers, workflow tools. Adding web search would be a concern boundary violation.
- A separate MCP server can be started, configured, and versioned independently. Users who only want web search (without GSD orchestration) can run just this server.
- The existing CLI entry point (`packages/mcp-server/src/cli.ts:14`) loads `SessionManager` and GSD-specific state — these are irrelevant to web search.
- The `packages/mcp-server/` package structure (`package.json`, `tsconfig.json`, `src/server.ts`, `src/cli.ts`) serves as the template for the new package.
- Matches OpenCode's approach where websearch is a separate MCP server.

**Alternatives considered**:
- Adding to existing `packages/mcp-server/` — rejected because it mixes concerns and couples search to GSD state management.
- Inlining search as a GSD extension tool (like `search-the-web`) — rejected because the goal is to expose search over MCP so it works with any MCP-compatible client, not just GSD's tool system.

### D002: OpenCode API as default search backend

**Decision**: Route search queries through OpenCode's API (`https://api.opencode.ai/.../search` or equivalent endpoint) using the existing `OPENCODE_API_KEY` as the default backend.

**Rationale**:
- `OPENCODE_API_KEY` is already a first-class credential in the project — it's in `PROVIDER_REGISTRY` (key-manager.ts:64-65), `AUTH_ENV_KEYS` (tool-credentials.ts:29-30), `env-api-keys.ts`, and `src/wizard.ts`.
- Users who have already configured OpenCode (Zen or Go) can search the web without any additional API key setup — this is the primary UX improvement.
- The OpenCode API likely provides a web search endpoint as part of its bundled capabilities (all major LLM providers offer this).
- Uses the same auth infrastructure — no new credential types or storage patterns needed.

**Alternatives considered**:
- DuckDuckGo scraping — rejected for reliability concerns (rate limits, CAPTCHAs, HTML structure changes, legal ambiguity).
- Self-hosted SearXNG — rejected because it requires infrastructure setup, contrary to the "works out-of-the-box" goal.
- Bundling a free search API key — rejected for security reasons (hardcoded keys in open-source repos).

### D003: Free fallback when no API key is configured

**Decision**: When neither `OPENCODE_API_KEY` nor any third-party search API key is set, the MCP server uses a rate-limited free search implementation (e.g., a lightweight DuckDuckGo Lite client or HackerSearch-style endpoint) with clear rate-limit warnings returned in the tool response text.

**Rationale**:
- The stated goal is "don't need search API's by default" — this means zero-configuration search must work.
- The rate limit (e.g., 10 queries/hour) prevents abuse while still providing basic search capability.
- The tool response includes a `rateLimited: true` flag and a message directing the user to configure `OPENCODE_API_KEY` or another search API key for full access.

**Mitigations**:
- The free fallback is clearly labeled in all tool responses as "Free tier (rate-limited)".
- The implementation must handle transport errors gracefully — if the free backend is unavailable, return a clear error instead of crashing.

### D004: Search provider passthrough respects existing `resolveSearchProvider()` preference

**Decision**: The MCP server's `web_search` tool imports and calls `resolveSearchProvider()` from `src/resources/extensions/search-the-web/provider.ts` to determine which backend to use. If the user has configured Brave, Tavily, or Ollama, those take priority over the OpenCode default.

**Rationale**:
- Reuses the existing search provider resolution logic (`provider.ts:95-150`) which already handles preference storage in `auth.json`, `PREFERENCES.md` overrides, and fallback chains.
- Users who already paid for a search API key should keep using it — the MCP server is not a replacement, it's a unified entry point.
- The MCP server does not reimplement provider selection — it delegates to the existing trusted code.

### D005: Auto-registration via GSD extension mechanism

**Decision**: Create a lightweight GSD extension at `src/resources/extensions/websearch-mcp/` with an `extension-manifest.json` and `index.ts` that registers the MCP server process. The extension starts the websearch MCP server as a child process (or launches it as a sidecar) and makes its tool available to the coding agent.

**Rationale**:
- Follows the same pattern as `search-the-web` extension (`src/resources/extensions/search-the-web/extension-manifest.json`) and `google-search` extension (`extensions/google-search/extension-manifest.json`).
- `pi.on("session_start")` hook (like search-the-web/index.ts:44) can start the MCP server process and advertise its tool to the agent.
- Avoids requiring the user to manually edit MCP client configuration files.
- The server is started lazily (on first search request) to avoid startup overhead.

**Alternatives considered**:
- Requiring manual `.mcp.json` configuration — rejected because it creates the same friction we're trying to eliminate.
- In-process Python/JS search library — rejected because MCP enables the tool to work with any MCP-compatible client.

### D006: Tool naming and parameter shape

**Decision**: The MCP server exposes two tools:
- `web_search` — accepts `query` (string, required), `count` (number, optional, 1-10, default 5), `freshness` (enum: "auto"|"day"|"week"|"month"|"year"), `domain` (string, optional). Returns structured search results with title, URL, description, and age.
- `web_search_fetch` — accepts `url` (string, required). Fetches and returns the full text content of a given URL.

**Rationale**:
- The `web_search` parameter shape mirrors the existing `search-the-web` tool (tool-search.ts:324-346) which has proven effective in production.
- The `web_search_fetch` tool is essential — search results give URLs, but the agent needs page content. This is analogous to the existing `fetch_page` tool.
- Using the same parameter names (`query`, `count`, `freshness`, `domain`) ensures consistency for model prompting across both the extension tool system and MCP tool system.

### D007: No changes to existing `search-the-web` extension

**Decision**: The existing `search-the-web` extension (including Brave/Tavily/Ollama tools and native Anthropic hooks) is left completely untouched. The new MCP server is an additional path, not a replacement.

**Rationale**:
- The existing tools have battle-tested search loop guards, caching, rate limiting, and TUI rendering (`tool-search.ts:349-675`).
- Users who have `BRAVE_API_KEY` or `TAVILY_API_KEY` configured should continue getting the full-featured experience they already have.
- The MCP server adds a "universal" search path that works across all model providers, while the existing tools remain for the GSD agent's native tool system.
- The existing `preferBraveSearch()`/`preferBraveSearch` logic (`native-search.ts:112-119`) continues to work as-is.

## Risks / Trade-offs

- **[Risk] OpenCode search endpoint changes or is removed** — The MCP server depends on OpenCode's API maintaining a search endpoint. If the endpoint changes, the server must be updated. **Mitigation**: The free fallback provides a grace period for updates. Version-pin the endpoint URL and document it in a single constant file.

- **[Risk] Free fallback is unreliable or blocked** — DuckDuckGo-style free search can be rate-limited or blocked by CAPTCHAs. **Mitigation**: Treat free fallback as best-effort. The tool response clearly states the limit and recommends configuring `OPENCODE_API_KEY`. No critical agent workflow should depend on the free tier.

- **[Risk] Confusion between MCP web_search and existing search-the-web tool** — Agents may have both tools available and pick the wrong one. **Mitigation**: The auto-registration in the GSD extension context (`session_start` hook) disables the MCP tool when the existing `search-the-web` is active, and vice versa. A `provider` field in the tool response helps the agent understand which backend was used.

- **[Risk] Duplicate tool definitions across model providers** — An Anthropic user may get both the native `web_search_20250305` (injected by `native-search.ts`) and the MCP `web_search` tool. **Mitigation**: The `search-the-web` extension already handles this — when native search is active, custom tools are removed from `pi.setActiveTools()` (`native-search.ts:191-196`). The MCP tool registration hooks into the same mechanism.

- **[Risk] OPENCODE_API_KEY is shared between OpenCode provider and search backend** — Users may not want search usage consuming their OpenCode API quota. **Mitigation**: Add a `WEBSEARCH_OPENCODE_KEY` env var override. If unset, fall back to `OPENCODE_API_KEY`. This way power users can use a dedicated key for search.

- **[Risk] Increased build time for the new package** — Each new package in the monorepo adds to `npm run build:core` time. **Mitigation**: The new package compiles independently with `tsc` and has minimal deps (`@modelcontextprotocol/sdk` + zod + fetch). Estimated additional build time: <2 seconds.

## Open Questions

1. **OpenCode search endpoint URL**: What is the exact endpoint path on `api.opencode.ai` for web search? Needs investigation during implementation. Will be stored as a constant in `packages/websearch-mcp-server/src/constants.ts`.

2. **Free fallback implementation**: What specific free search backend should be used? Options to investigate during implementation: DuckDuckGo Lite API, HackerNews search, or a bundled lightweight scraper. The design doesn't prescribe one — the implementation should pick the most reliable option available at build time.

3. **Rate limits for free fallback**: What are sensible defaults? Proposal: 10 queries/hour per IP, stored in-memory (no persistence). These can be tuned after user feedback.

4. **Package version**: Should `@opengsd/websearch-mcp-server` start at `0.1.0` (pre-release) or `1.0.0` (stable from the start)? Recommendation: mirror the root `version` field (`1.0.2`) for consistency.
