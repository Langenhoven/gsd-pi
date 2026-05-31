/**
 * @gsd/websearch-mcp-server — MCP server for web search via DuckDuckGo.
 */

export { createWebSearchServer } from './server.js';
export { searchDuckDuckGo, WebSearchError } from './search-duckduckgo.js';
export type { SearchResult, SearchOptions } from './search-duckduckgo.js';
export { RateLimiter } from './rate-limiter.js';
export type { RateLimitResult } from './rate-limiter.js';
