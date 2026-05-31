## ADDED Requirements

### Requirement: web_search tool accepts query parameters

The `web_search` MCP tool SHALL accept the following parameters using the same names as the existing `search-the-web` tool for model familiarity:

- `query` (string, required) — The search query string
- `count` (number, optional, 1–10, default 5) — Number of results to return
- `freshness` (string, optional, enum: `"auto"` | `"day"` | `"week"` | `"month"` | `"year"`, default `"auto"`) — Recency filter
- `domain` (string, optional) — Restrict results to a specific domain (e.g., `"stackoverflow.com"`)

#### Scenario: Basic search with query only

- **WHEN** the tool is called with `{ query: "latest TypeScript features" }`
- **THEN** it SHALL return an array of search results with `title`, `url`, `description`, and `age` fields, limited to 5 results

#### Scenario: Search with explicit count

- **WHEN** the tool is called with `{ query: "news", count: 3 }`
- **THEN** it SHALL return exactly 3 results (or fewer if fewer are available)

#### Scenario: Search with freshness filter

- **WHEN** the tool is called with `{ query: "React 19", freshness: "week" }`
- **THEN** results SHALL be filtered to pages from the past week

#### Scenario: Search with domain filter

- **WHEN** the tool is called with `{ query: "authentication", domain: "github.com" }`
- **THEN** results SHALL be limited to the specified domain

#### Scenario: Count exceeds maximum

- **WHEN** the tool is called with `{ query: "test", count: 20 }`
- **THEN** the tool SHALL return an error indicating count must be 1–10

### Requirement: Search backend resolution follows provider preference

The tool SHALL resolve the search provider using `resolveSearchProvider()` from `src/resources/extensions/search-the-web/provider.ts`, respecting the user's stored preference and available API keys in this priority order:

1. User stored preference (Brave, Tavily, Ollama) — if configured
2. OpenCode API — if `OPENCODE_API_KEY` is set
3. Free fallback — if no API keys are configured

#### Scenario: Uses Brave when BRAVE_API_KEY is set and user prefers Brave

- **WHEN** `BRAVE_API_KEY` is set and `resolveSearchProvider()` returns `"brave"`
- **THEN** the search request SHALL be routed to `https://api.search.brave.com/res/v1/web/search`

#### Scenario: Uses OpenCode API when OPENCODE_API_KEY is set

- **WHEN** `OPENCODE_API_KEY` is set and no Brave/Tavily/Ollama key is configured
- **THEN** the search request SHALL be routed to the OpenCode search endpoint

#### Scenario: Uses free fallback when no API keys are set

- **WHEN** no search API key or `OPENCODE_API_KEY` is set
- **THEN** the search SHALL use a rate-limited free search backend

### Requirement: Structured search result output

The tool SHALL return search results as structured content with the following fields per result:

- `title` (string) — Result page title
- `url` (string) — Full URL to the result
- `description` (string) — Snippet/description text
- `age` (string, optional) — How old the result is (e.g., "2 days ago")

#### Scenario: Results include all fields

- **WHEN** the tool returns results
- **THEN** each result SHALL have at least `title`, `url`, and `description` populated

#### Scenario: Results are deduplicated

- **WHEN** multiple backends return overlapping results
- **THEN** the tool SHALL deduplicate by URL (first occurrence wins)

### Requirement: Error taxonomy mirrors existing search-the-web

The tool SHALL return structured errors following the same taxonomy as `tool-search.ts`:

- `auth_error` — API key is missing or rejected
- `rate_limited` — API rate limit exceeded; includes `retryAfterMs`
- `network_error` — DNS/proxy/connection failure
- `no_results` — Query returned zero results
- `invalid_query` — Query rejected by search backend
- `provider_unavailable` — Selected search provider is unavailable

#### Scenario: Auth error when key is rejected

- **WHEN** the search backend returns a 401 or 403 status
- **THEN** the tool SHALL return with `isError: true` and `errorKind: "auth_error"`

#### Scenario: Rate limit error

- **WHEN** the search backend returns a 429 status
- **THEN** the tool SHALL return with `isError: true`, `errorKind: "rate_limited"`, and `retryAfterMs` populated from the `Retry-After` header

### Requirement: Free fallback mode is self-identifying

When the free fallback backend is active, the tool response SHALL include:
- A `provider: "free"` field in the tool result
- A notice in the text output: "Free tier (rate-limited). Configure OPENCODE_API_KEY or a search API key for full access."

#### Scenario: Free fallback is labeled

- **WHEN** the tool executes using the free fallback backend
- **THEN** the response SHALL include `provider: "free"` in the details

### Requirement: Free fallback rate limit

The free fallback SHALL enforce an in-memory rate limit of 10 queries per hour per process instance. The rate limit SHALL reset when the server restarts.

#### Scenario: Rate limit exceeded on free tier

- **WHEN** the 11th search request arrives within a one-hour window on the free tier
- **THEN** the tool SHALL return `isError: true` with `errorKind: "rate_limited"` and a message indicating the limit has been reached
