## ADDED Requirements

### Requirement: Sliding-window rate limiter

The `src/rate-limiter.ts` module SHALL implement a sliding-window rate limiter that tracks request timestamps and rejects requests that exceed the configured limit. The module SHALL export a `RateLimiter` class with `check()` and `reset()` methods.

#### Scenario: Default rate limit is 1 request per second

- **WHEN** a `RateLimiter` is instantiated with default settings
- **THEN** it SHALL allow 1 request per 1-second sliding window

#### Scenario: Request within window is allowed

- **WHEN** `check()` is called after no prior requests
- **THEN** it SHALL return `{ allowed: true }`

#### Scenario: Request outside window is allowed

- **WHEN** 2 seconds have elapsed since the last request in a 1 req/s limiter
- **THEN** `check()` SHALL return `{ allowed: true }`

#### Scenario: Request within window is rejected

- **WHEN** a request arrives 0.3 seconds after the previous request in a 1 req/s limiter
- **THEN** `check()` SHALL return `{ allowed: false, retryAfterMs: 700 }` (700ms remaining in the window)

### Requirement: Configurable rate limit via environment variable

The rate limit SHALL be configurable via the `WEBSEARCH_RATE_LIMIT_RPM` environment variable, which specifies the maximum requests per 60-second window.

#### Scenario: WEBSEARCH_RATE_LIMIT_RPM=30 allows 1 request per 2 seconds

- **WHEN** `WEBSEARCH_RATE_LIMIT_RPM=30` is set
- **THEN** the effective rate SHALL be 30 requests per 60 seconds (1 per 2 seconds)

#### Scenario: Invalid RPM value falls back to default

- **WHEN** `WEBSEARCH_RATE_LIMIT_RPM=0` or `WEBSEARCH_RATE_LIMIT_RPM=-1` is set
- **THEN** the rate limit SHALL fall back to 60 RPM (1 req/s)

#### Scenario: Hot reload disclaimer

- **WHEN** `WEBSEARCH_RATE_LIMIT_RPM` is changed while the process is running
- **THEN** the rate limit SHALL NOT change — it is read once at startup

### Requirement: Rate limiter is self-healing

The rate limiter SHALL automatically garbage-collect expired timestamps from the internal window to prevent unbounded memory growth. When the window is empty, the rate limit is effectively reset.

#### Scenario: Idle period resets the window

- **WHEN** no requests are made for more than 60 seconds
- **THEN** the internal timestamp array SHALL be empty, and the next request SHALL be allowed immediately

#### Scenario: No memory leak under continuous use

- **WHEN** requests arrive steadily at the maximum allowed rate for 1 hour
- **THEN** the internal timestamp array SHALL contain at most 60 entries (for a 1 req/s limit, only the last 60 seconds are tracked)

### Requirement: Rate limit awareness at the server level

The MCP server SHALL check the rate limiter before processing every `web_search` tool call. If rate-limited, the server SHALL return an MCP tool error rather than silently dropping the request.

#### Scenario: Rate-limited request returns structured error

- **WHEN** `RateLimiter.check()` returns `{ allowed: false, retryAfterMs: 800 }`
- **THEN** the server SHALL return an MCP tool error with `isError: true`, `errorKind: "rate_limited"`, and `retryAfterMs: 800`

#### Scenario: Rate-limited request does not block the server

- **WHEN** a `web_search` call is rate-limited
- **THEN** the server SHALL continue processing other requests (including `web_search_fetch`, which is NOT rate-limited by the same limiter)

### Requirement: Rate limit approaching warning

The rate limiter SHALL expose an `isApproachingLimit()` method that returns `true` when 75% or more of the sliding window is consumed (e.g., 0.75+ requests per second sustained).

#### Scenario: Approaching limit warning

- **WHEN** 4 consecutive requests arrive within 3 seconds (0.75+ req/s sustained for a 1 req/s limit)
- **THEN** `isApproachingLimit()` SHALL return `true`

#### Scenario: Warning clears after idle period

- **WHEN** no requests are made for 1 second following approaching-limit state
- **THEN** `isApproachingLimit()` SHALL return `false`
