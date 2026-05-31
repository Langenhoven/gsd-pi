# Design: Add Packaged Websearch MCP Server

## D001 — New Package Structure

**Decision:** Create `packages/websearch-mcp-server/` as a new workspace package following the same structure as `packages/mcp-server/`.

**Rationale:**
- The existing `packages/mcp-server/` ships a single, opinionated server. A websearch-specific MCP server keeps concerns separated — the general MCP server handles RPC and credential management, while the websearch server focuses solely on search.
- Independent packaging means the websearch MCP server can be spawned as a child process without coupling to the main server's lifecycle.
- Users who don't want web search (air-gapped environments) can skip this package.

**Details:**
- Package manager: pnpm workspace (`"@gsd/websearch-mcp-server": "workspace:*"`)
- Dependencies: `@modelcontextprotocol/sdk` (same version as `packages/mcp-server/`), `cheerio` for HTML result parsing
- Dev dependencies: `typescript`, `tsx` (for development)
- Entry points: `src/cli.ts` (CLI binary), `src/index.ts` (library API)
- The CLI binary is defined in `package.json` `"bin"` and built to a `dist/` directory

---

## D002 — DuckDuckGo HTML as Default Search Backend

**Decision:** Use `https://html.duckduckgo.com/html` via HTTP POST with form-encoded query parameters as the sole built-in search backend. No API key, no registration, no SDK required.

**Rationale:**
- DuckDuckGo's no-JS HTML endpoint provides free web search without any account or API key — exactly the "zero configuration" requirement.
- This endpoint is production-proven by SearXNG (years of uptime) and multiple open-source MCP servers (`duckduckgo-mcp-server`, `@oevortex/ddg_search`).
- Using `fetch()` (built into Node.js 18+) avoids adding a search SDK dependency.

**Details:**
- **Endpoint**: `POST https://html.duckduckgo.com/html`
- **Body**: `q={encoded_query}&kl=wt-wt` (worldwide region)
- **Headers**: `User-Agent: Mozilla/5.0 ...`, `Referer: https://duckduckgo.com/`, `Content-Type: application/x-www-form-urlencoded`
- **Parsing**: Extract `<a class="result__a">` (title), `<a class="result__url">` (URL), `<a class="result__snippet">` (description) from HTML using cheerio
- **Fallback endpoint**: `https://lite.duckduckgo.com/lite` — simpler HTML, attempted if the primary endpoint returns a CAPTCHA page (detected by the presence of CAPTCHA keywords in response)
- **No alternative providers in the MCP server**: DuckDuckGo is the single built-in backend. The existing Brave/Tavily/Ollama/Google search providers remain available through their existing infrastructure (`search-the-web` extension) and are completely unaffected by this change.

---

## D003 — Rate Limiting

**Decision:** Implement a sliding-window rate limiter within the MCP server process that enforces safe request rates to DuckDuckGo.

**Rationale:**
- DuckDuckGo's bot protection system triggers IP blocks under aggressive usage. A self-respecting rate limiter is required for reliable production use.
- SearXNG documentation and `duckduckgo-mcp-server` both confirm 1 request/second as a safe sustained rate.
- In-process rate limiting is simpler and more portable than external rate-limiting infrastructure (no Redis, no file locks).

**Details:**
- **Algorithm**: Sliding window counter — tracks request timestamps in an array, removes entries outside the window on each check
- **Default limit**: 1 request per second (configurable via `WEBSEARCH_RATE_LIMIT_RPM` env var)
- **Behavior when exceeded**: Returns an MCP tool error with message: `"Rate limited. Try again in {seconds} seconds."`
- **No queuing**: Requests exceeding the limit are rejected immediately — the agent can retry after the indicated delay
- **Self-healing**: The window array is garbage-collected when the last timestamp falls outside the window; a cold start has no rate limit restrictions
- **No cross-process coordination**: Each MCP server process has its own independent rate limiter. Multiple agents running simultaneously each maintain their own window.

---

## D004 — Auto-Registration as Packaged MCP Tool

**Decision:** Register the websearch MCP server's tools automatically through a bundled GSD extension at `src/resources/extensions/websearch-mcp/`, following the existing pattern for packaged MCP tool registration.

**Rationale:**
- Coding agents that connect to the GSD runtime should discover web search tools without manual MCP configuration.
- Bundling the MCP server as an extension keeps registration logic co-located with the server and follows the existing convention in the codebase.

**Details:**
- The extension defines an MCP tool config with:
  - `command`: path to the compiled `cli.js` entry point or `tsx src/cli.ts` in development
  - `env`: optional environment variables (rate limit config)
  - `args`: forwarded to the CLI binary
- The GSD runtime spawns the websearch MCP server as a child process over stdio and routes tool calls to it
- The server process is lazily spawned on first tool invocation and remains alive for the session

---

## D005 — Tool Naming and Schema

**Decision:** Expose two tools: `web_search` (search) and `web_search_fetch` (fetch URL content). Tool names follow the existing MCP naming convention (lowercase, underscore-separated).

**Rationale:**
- `web_search` and `web_search_fetch` mirror the naming of similar tools across the ecosystem and are intuitive for coding agents.
- Separating search from fetch keeps tool surface area small and each tool's responsibility clear.

**Details:**

### `web_search`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | yes | — | The search query |
| `count` | number | no | 10 | Number of results (1–20) |
| `freshness` | string | no | — | Filter by time: `day`, `week`, `month`, `year` |
| `site` | string | no | — | Restrict results to a domain (e.g., `github.com`). Prepended to query as `site:{domain}`. |

Returns `SearchResult[]` with fields: `{title, url, snippet, published_date?}`

### `web_search_fetch`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | yes | — | The URL to fetch |
| `max_content_length` | number | no | 10000 | Max characters to return (500–50000) |

Returns `{url, content, content_type, truncated}`

---

## D006 — No Changes to Existing Provider Infrastructure

**Decision:** Do not modify `PROVIDER_REGISTRY`, `onboarding-service.ts`, `tool-credentials.ts`, `wizard.ts`, or `provider-display-names.ts`.

**Rationale:**
- DuckDuckGo requires no API key or env var — there is nothing to configure, validate, or store.
- The existing search providers (Brave, Tavily, Ollama, Google) are unaffected and remain fully functional through the `search-the-web` extension and other existing tooling.
- The websearch MCP server is an additive feature, not a replacement for the existing search infrastructure.

---

## D007 — No Changes to Existing Search Infrastructure

**Decision:** The `search-the-web` extension, the `extensions/google-search/` extension, the native `web_search_20250305` hook, and `packages/mcp-server/` are all completely untouched.

**Rationale:**
- These search pathways serve different use cases (provider-specific search, Anthropic-native search, general MCP infrastructure).
- Keeping them unchanged preserves backward compatibility and avoids regressions.
- Users who have configured API keys for these providers continue to use them exactly as before.
