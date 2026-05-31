/**
 * MCP Server — exposes web_search and web_search_fetch tools via MCP stdio transport.
 *
 * The server uses DuckDuckGo as its sole built-in backend (no API key required)
 * and enforces rate limiting to protect against bot detection and IP blocking.
 */

import { z } from 'zod';
import { createRequire } from 'node:module';
import { searchDuckDuckGo, WebSearchError } from './search-duckduckgo.js';
import { RateLimiter } from './rate-limiter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MCP_PKG = '@modelcontextprotocol/sdk';

const SERVER_NAME = 'gsd-websearch';

const SERVER_VERSION: string = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version;
  } catch { /* fall through */ }
  return '0.0.0';
})();

// ─── Rate limiter (shared across all tool calls) ──────────────────────────────

const rateLimiter = new RateLimiter();

// ─── Tool schemas ─────────────────────────────────────────────────────────────

const WebSearchSchema = z.object({
  query: z.string().min(1, 'Query must be a non-empty string'),
  count: z.number().int().min(1).max(20).default(10).optional(),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
  site: z.string().optional(),
});

const WebSearchFetchSchema = z.object({
  url: z.string().url('URL must be a valid fully-qualified URL').min(1),
  max_content_length: z.number().int().min(500).max(100000).default(10000).optional(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebSearchParams = z.infer<typeof WebSearchSchema>;
export type WebSearchFetchParams = z.infer<typeof WebSearchFetchSchema>;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FetchResult {
  url: string;
  content: string;
  contentType: string;
  contentLength: number;
  truncated?: boolean;
  resolvedUrl?: string;
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleWebSearch(params: WebSearchParams): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  // Check rate limiter
  const rateCheck = rateLimiter.check();
  if (!rateCheck.allowed) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            errorKind: 'rate_limited',
            retryAfterMs: rateCheck.retryAfterMs,
            message: `Rate limited. Try again in ${Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000)} seconds.`,
          }),
        },
      ],
    };
  }

  try {
    const results = await searchDuckDuckGo(params.query, {
      count: params.count ?? 10,
      freshness: params.freshness,
      site: params.site,
    });

    if (results.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              errorKind: 'no_results',
              message: 'No results found for the given query.',
            }),
          },
        ],
      };
    }

    // Check approaching limit warning
    const approachingWarning = rateLimiter.isApproachingLimit()
      ? '\n\nRate limit approaching — consider adding delay between requests.'
      : '';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results) + approachingWarning,
        },
      ],
    };
  } catch (err) {
    if (err instanceof WebSearchError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              errorKind: err.kind,
              message: err.message,
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            errorKind: 'provider_unavailable',
            message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
          }),
        },
      ],
    };
  }
}

async function handleWebSearchFetch(params: WebSearchFetchParams): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const maxLength = params.max_content_length ?? 10000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(params.url, {
      headers: {
        'User-Agent': 'GSD-WebSearch-MCP/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const resolvedUrl = response.url;
    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const status = response.status;

    // Handle HTTP errors
    if (status === 404) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'page_not_found', message: `Page not found: ${params.url}` }) }] };
    }
    if (status === 403) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'access_denied', message: `Access denied: ${params.url}` }) }] };
    }
    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'rate_limited', retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined, message: 'Rate limited by the remote server.' }) }] };
    }
    if (status >= 500) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'server_error', message: `Server error ${status} for: ${params.url}` }) }] };
    }

    // Check content type
    const isHtml = contentType.includes('text/html');
    const isBinary = contentType.startsWith('application/pdf') ||
      contentType.startsWith('image/') ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/');

    if (isBinary) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'unsupported_content_type', message: `Content type ${contentType} is not supported for text extraction.` }) }] };
    }

    const rawText = await response.text();
    let content: string;

    if (isHtml) {
      // Strip HTML tags for HTML content
      content = stripHtml(rawText);
    } else {
      // Return raw text for non-HTML (JSON, XML, plain text)
      content = rawText;
    }

    const truncated = content.length > maxLength;
    if (truncated) {
      content = content.slice(0, maxLength);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            url: params.url,
            resolvedUrl,
            content,
            contentType,
            contentLength: content.length,
            truncated,
          }),
        },
      ],
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'timeout', message: 'Request timed out after 15 seconds.' }) }] };
    }
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ errorKind: 'network_error', message: `Network error: ${err instanceof Error ? err.message : String(err)}` }) }] };
  }
}

/**
 * Strip HTML tags, scripts, and styles from HTML content.
 */
function stripHtml(html: string): string {
  return html
    // Remove script tags and content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove style tags and content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Server factory ───────────────────────────────────────────────────────────

export async function createWebSearchServer() {
  const { McpServer } = await import(`${MCP_PKG}/server/mcp.js`);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register web_search tool
  server.tool(
    'web_search',
    'Search the web using DuckDuckGo. Free and requires no API key. Returns structured results with title, URL, and snippet.',
    {
      query: z.string().describe('The search query'),
      count: z.number().int().min(1).max(20).default(10).optional().describe('Number of results (1–20, default 10)'),
      freshness: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter by time: day, week, month, or year'),
      site: z.string().optional().describe('Restrict results to a domain (e.g., github.com)'),
    },
    async (args: WebSearchParams) => {
      return await handleWebSearch(args);
    },
  );

  // Register web_search_fetch tool
  server.tool(
    'web_search_fetch',
    'Fetch and extract readable text content from a URL. Returns content, content type, and length.',
    {
      url: z.string().describe('The fully qualified URL to fetch'),
      max_content_length: z.number().int().min(500).max(100000).default(10000).optional().describe('Maximum characters to return (500–100000, default 10000)'),
    },
    async (args: WebSearchFetchParams) => {
      return await handleWebSearchFetch(args);
    },
  );

  return { server, rateLimiter };
}
