/**
 * DuckDuckGo HTML search client.
 *
 * Uses the no-JS HTML endpoint (https://html.duckduckgo.com/html) which
 * requires no API key, no registration, and no SDK. Falls back to the
 * lite endpoint (https://lite.duckduckgo.com/lite) on CAPTCHA detection.
 */

import * as cheerio from 'cheerio';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  count?: number;
  freshness?: 'day' | 'week' | 'month' | 'year';
  site?: string;
}

export class WebSearchError extends Error {
  constructor(
    public readonly kind: 'network_error' | 'no_results' | 'invalid_query' | 'provider_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'WebSearchError';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_ENDPOINT = 'https://html.duckduckgo.com/html';
const FALLBACK_ENDPOINT = 'https://lite.duckduckgo.com/lite';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GSD-WebSearch-MCP/1.0)';

const FRESHNESS_MAP: Record<string, string> = {
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y',
} as const;

// ─── Main search function ─────────────────────────────────────────────────────

export async function searchDuckDuckGo(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    throw new WebSearchError('invalid_query', 'Query must be a non-empty string');
  }

  const count = options.count ?? 10;
  let searchQuery = query.trim();

  // Prepend site filter if provided
  if (options.site) {
    searchQuery = `site:${options.site} ${searchQuery}`;
  }

  // Try primary endpoint first, fall back to lite on CAPTCHA
  let html: string;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const body = new URLSearchParams({ q: searchQuery, kl: 'wt-wt' });

    // Add freshness filter
    if (options.freshness && FRESHNESS_MAP[options.freshness]) {
      body.set('df', FRESHNESS_MAP[options.freshness]!);
    }

    const response = await fetch(PRIMARY_ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://duckduckgo.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new WebSearchError(
        'provider_unavailable',
        `DuckDuckGo returned status ${response.status}`,
      );
    }

    html = await response.text();
  } catch (err) {
    if (err instanceof WebSearchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WebSearchError('network_error', 'Request timed out after 15 seconds');
    }
    throw new WebSearchError(
      'network_error',
      `Failed to reach DuckDuckGo: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Check for CAPTCHA
  if (isCaptchaResponse(html)) {
    html = await tryFallback(searchQuery);
  }

  // Parse results
  const results = parsePrimaryResults(html);

  // Truncate to requested count
  return results.slice(0, count);
}

// ─── CAPTCHA detection ────────────────────────────────────────────────────────

function isCaptchaResponse(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('captcha') ||
    lower.includes('verify') ||
    lower.includes('challenge') ||
    lower.includes('blocked')
  );
}

// ─── Fallback to lite endpoint ────────────────────────────────────────────────

async function tryFallback(query: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(FALLBACK_ENDPOINT);
    url.searchParams.set('q', query);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://duckduckgo.com/',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new WebSearchError(
        'provider_unavailable',
        `DuckDuckGo lite endpoint returned status ${response.status}`,
      );
    }

    return await response.text();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof WebSearchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WebSearchError('network_error', 'Fallback request timed out');
    }
    throw new WebSearchError(
      'network_error',
      `Fallback request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

function parsePrimaryResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.result').each((_i, el) => {
    const titleEl = $(el).find('.result__title a');
    const snippetEl = $(el).find('.result__snippet');
    const urlEl = $(el).find('.result__url');

    const title = titleEl.text()?.trim() ?? '';
    const snippet = snippetEl.text()?.trim() ?? '';
    const url = urlEl.attr('href') ?? '';

    if (title && url) {
      // DuckDuckGo wraps URLs in redirect — extract the actual URL
      const actualUrl = extractUrl(url);
      results.push({ title, url: actualUrl, snippet });
    }
  });

  // If no results found via .result selector, try alternate selectors
  if (results.length === 0) {
    $('a.result__a').each((_i, el) => {
      const title = $(el).text()?.trim() ?? '';
      const url = $(el).attr('href') ?? '';
      // Try to find sibling or parent for snippet
      const snippetEl = $(el).closest('.result').find('.result__snippet').first()
        || $(el).parent().next('.result__snippet');
      const snippet = $(snippetEl).text()?.trim() ?? '';

      if (title && url) {
        results.push({ title, url: extractUrl(url), snippet });
      }
    });
  }

  return results;
}

/**
 * DuckDuckGo search result URLs often look like:
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&...
 * Extract the actual target URL from the redirect wrapper.
 */
function extractUrl(raw: string): string {
  if (!raw) return '';

  // If it's a DuckDuckGo redirect URL, extract the `uddg` parameter
  if (raw.includes('uddg=')) {
    try {
      const parsed = new URL(raw, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
    } catch {
      // fall through to raw URL
    }
  }

  // If it starts with //, prepend https:
  if (raw.startsWith('//')) return `https:${raw}`;

  // If it's a relative path, resolve against DuckDuckGo
  if (raw.startsWith('/')) return `https://duckduckgo.com${raw}`;

  return raw;
}
