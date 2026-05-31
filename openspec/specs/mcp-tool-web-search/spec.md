## ADDED Requirements

### Requirement: web_search tool accepts search parameters

The `web_search` MCP tool SHALL accept the following parameters:
- `query` (string, required) — The search query string
- `count` (number, optional, 1–20, default 10) — Number of results to return
- `freshness` (string, optional, one of: `"day"` | `"week"` | `"month"` | `"year"`) — Recency filter passed as `df` parameter to DuckDuckGo
- `site` (string, optional) — Restrict results to a specific domain (e.g., `"github.com"`), prepended as `site:domain` to the query

#### Scenario: Basic search with query only

- **WHEN** the tool is called with `{ query: "latest TypeScript features" }`
- **THEN** it SHALL return an array of search results with `title`, `url`, and `snippet` fields, limited to 10 results by default

#### Scenario: Search with explicit count

- **WHEN** the tool is called with `{ query: "news", count: 3 }`
- **THEN** it SHALL return at most 3 results

#### Scenario: Search with freshness filter

- **WHEN** the tool is called with `{ query: "React 19", freshness: "week" }`
- **THEN** the request to DuckDuckGo SHALL include `df=w` to filter by date

#### Scenario: Search with site filter

- **WHEN** the tool is called with `{ query: "auth", site: "github.com" }`
- **THEN** the query sent to DuckDuckGo SHALL be `"site:github.com auth"`

#### Scenario: Count exceeds maximum

- **WHEN** the tool is called with `{ query: "test", count: 50 }`
- **THEN** the tool SHALL return an error indicating count must be between 1 and 20

### Requirement: DuckDuckGo is the sole built-in search backend

The tool SHALL use the DuckDuckGo HTML search client from `src/search-duckduckgo.ts` as its only built-in backend. No API key is required — the tool works without any configuration.

#### Scenario: Search works without any API keys

- **WHEN** the tool is called with no `BRAVE_API_KEY`, `TAVILY_API_KEY`, or any other search API key set
- **THEN** the search SHALL execute against DuckDuckGo and return results

#### Scenario: Existing search providers are unaffected

- **WHEN** a user has `BRAVE_API_KEY` and `TAVILY_API_KEY` configured
- **THEN** the `web_search` tool SHALL still use DuckDuckGo — the existing Brave/Tavily/Ollama/Google search infrastructure remains available through its own separate tooling

### Requirement: Structured search result output

The tool SHALL return search results as structured content with the following fields per result:
- `title` (string) — Result page title
- `url` (string) — Full URL to the result page
- `snippet` (string) — Snippet/description text extracted from the search result

#### Scenario: Results include all fields

- **WHEN** the tool returns results
- **THEN** each result SHALL have at least `title`, `url`, and `snippet` populated (depending on DuckDuckGo's response — `snippet` MAY be empty for some results)

#### Scenario: Results are limited to requested count

- **WHEN** DuckDuckGo returns more results than the requested `count`
- **THEN** the tool SHALL truncate the result array to `count` items

### Requirement: Error taxonomy

The tool SHALL return structured errors using the following error kinds:
- `rate_limited` — MCP server rate limit exceeded; includes `retryAfterMs`
- `network_error` — DNS/proxy/connection failure when contacting DuckDuckGo
- `no_results` — Query returned zero results from DuckDuckGo
- `invalid_query` — Query rejected by DuckDuckGo (empty query, excessive length)
- `provider_unavailable` — DuckDuckGo endpoint is unreachable

#### Scenario: Rate limit error

- **WHEN** the rate limiter rejects a request (1-second window not yet elapsed)
- **THEN** the tool SHALL return with `isError: true`, `errorKind: "rate_limited"`, and `retryAfterMs` populated

#### Scenario: Network error

- **WHEN** DuckDuckGo is unreachable
- **THEN** the tool SHALL return with `isError: true` and `errorKind: "network_error"`

#### Scenario: No results

- **WHEN** DuckDuckGo returns zero results for the query
- **THEN** the tool SHALL return with `isError: true` and `errorKind: "no_results"`

### Requirement: Rate limit notice in successful results

When the rate limiter is close to the limit (75% or more of the sliding window consumed), the tool SHALL include a notice in the text output of the result indicating that rate limiting may be approaching.

#### Scenario: Approaching rate limit warning

- **WHEN** the rate limiter has processed more than 3 requests in the last 4 seconds (75% of 1 req/s capacity)
- **THEN** the response text SHALL include the message "Rate limit approaching — consider adding delay between requests"
