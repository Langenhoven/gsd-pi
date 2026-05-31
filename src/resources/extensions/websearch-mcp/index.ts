/**
 * WebSearch MCP Extension
 *
 * Registers web_search and web_search_fetch tools that provide free
 * web search via DuckDuckGo — no API key required.
 *
 * When the active model provider is Anthropic (which has native
 * web_search_20250305), these tools are hidden to avoid duplicate
 * search capabilities. When switching away from Anthropic, the
 * tools are restored.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Text } from "@gsd/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface FetchResult {
  url: string;
  content: string;
  contentType: string;
  contentLength: number;
  truncated?: boolean;
  resolvedUrl?: string;
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 60, windowMs = 60_000) {
    const envRpm = process.env.WEBSEARCH_RATE_LIMIT_RPM;
    const rpm = envRpm ? (Number(envRpm) || maxRequests) : maxRequests;
    this.maxRequests = rpm;
    this.windowMs = windowMs;
  }

  check(): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return { allowed: true };
    }
    const retryAfterMs = this.timestamps[0]! + this.windowMs - now + 1;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
  }

  isApproachingLimit(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
    return this.timestamps.length >= this.maxRequests * 0.75;
  }
}

const rateLimiter = new RateLimiter();

// ─── DuckDuckGo Search ────────────────────────────────────────────────────────

const DDG_PRIMARY = "https://html.duckduckgo.com/html";
const DDG_FALLBACK = "https://lite.duckduckgo.com/lite";
const SEARCH_TIMEOUT = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; GSD-WebSearch-MCP/1.0)";
const FRESHNESS_MAP: Record<string, string> = { day: "d", week: "w", month: "m", year: "y" };

class SearchError extends Error {
  constructor(public readonly kind: string, message: string) {
    super(message);
    this.name = "SearchError";
  }
}

class FetchError extends Error {
  constructor(public readonly kind: string, message: string) {
    super(message);
    this.name = "FetchError";
  }
}

async function searchDuckDuckGo(query: string, options: { count?: number; freshness?: string; site?: string } = {}): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) throw new SearchError("invalid_query", "Query must be a non-empty string");
  const count = options.count ?? 10;
  let searchQuery = query.trim();
  if (options.site) searchQuery = `site:${options.site} ${searchQuery}`;

  const body = new URLSearchParams({ q: searchQuery, kl: "wt-wt" });
  if (options.freshness && FRESHNESS_MAP[options.freshness]) body.set("df", FRESHNESS_MAP[options.freshness]!);

  let html = await fetchWithTimeout(DDG_PRIMARY, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Referer: "https://duckduckgo.com/", "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (isCaptchaResponse(html)) {
    html = await fetchWithTimeout(`${DDG_FALLBACK}?q=${encodeURIComponent(searchQuery)}`, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Referer: "https://duckduckgo.com/" },
    });
  }

  const results = parseDdgResults(html);
  return results.slice(0, count);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new SearchError("provider_unavailable", `DuckDuckGo returned status ${response.status}`);
    return await response.text();
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SearchError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new SearchError("network_error", "Request timed out after 15 seconds");
    throw new SearchError("network_error", err instanceof Error ? err.message : String(err));
  }
}

function isCaptchaResponse(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes("captcha") || lower.includes("verify") || lower.includes("challenge");
}

function parseDdgResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const anchorRe = /<a[^>]*class="result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const anchors: Array<{ href: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    anchors.push({ href: decodeDdgUrl(m[1]!), title: m[2]!.replace(/<[^>]+>/g, "").trim() });
  }

  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(m[1]!.replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < anchors.length; i++) {
    results.push({ title: anchors[i]!.title, url: anchors[i]!.href, snippet: snippets[i] ?? "" });
  }
  return results;
}

function decodeDdgUrl(raw: string): string {
  if (!raw) return "";
  if (raw.includes("uddg=")) {
    try {
      const uddg = new URL(raw, "https://duckduckgo.com").searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    } catch { /* ignore */ }
  }
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://duckduckgo.com${raw}`;
  return raw;
}

// ─── Page Fetch ───────────────────────────────────────────────────────────────

async function fetchPage(url: string, maxLength: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GSD-WebSearch-MCP/1.0", Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") ?? "text/plain";
    if (response.status === 404) throw new FetchError("page_not_found", `Page not found: ${url}`);
    if (response.status === 403) throw new FetchError("access_denied", `Access denied: ${url}`);
    if (response.status === 429) throw new FetchError("rate_limited", "Rate limited by the remote server");
    if (response.status >= 500) throw new FetchError("server_error", `Server error ${response.status} for: ${url}`);

    const isBinary = contentType.startsWith("application/pdf") || contentType.startsWith("image/") || contentType.startsWith("audio/") || contentType.startsWith("video/");
    if (isBinary) throw new FetchError("unsupported_content_type", `Content type "${contentType}" is not supported`);

    const rawText = await response.text();
    const text = contentType.includes("text/html") ? stripHtml(rawText) : rawText;
    const truncated = text.length > maxLength;

    return {
      url,
      resolvedUrl: response.url,
      content: truncated ? text.slice(0, maxLength) : text,
      contentType,
      contentLength: text.length,
      truncated,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new FetchError("timeout", "Request timed out after 15 seconds");
    throw new FetchError("network_error", err instanceof Error ? err.message : String(err));
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Tool visibility ──────────────────────────────────────────────────────────

const TOOL_NAMES = ["web_search", "web_search_fetch"];

// Native search providers where MCP search tools should be hidden
const NATIVE_SEARCH_PROVIDERS = new Set(["anthropic", "claude-code", "anthropic-vertex"]);

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── web_search tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using DuckDuckGo. Free and requires no API key. " +
      "Returns structured results with title, URL, and snippet for each result.",
    promptSnippet: "Search the web for information",
    promptGuidelines: [
      "Use web_search when you need current information from the web.",
      "Supports freshness filtering (day, week, month, year) and site restriction.",
      "Rate limited to 1 request/second by default — add delay between rapid searches.",
      "No API key or configuration required.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      count: Type.Optional(Type.Number({ description: "Number of results (1–20, default 10)", minimum: 1, maximum: 20 })),
      freshness: Type.Optional(Type.String({ description: "Filter by time: day, week, month, or year" })),
      site: Type.Optional(Type.String({ description: "Restrict results to a domain (e.g., github.com)" })),
    }),

    async execute(_id, params: { query: string; count?: number; freshness?: string; site?: string }) {
      const rateCheck = rateLimiter.check();
      if (!rateCheck.allowed) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ errorKind: "rate_limited", retryAfterMs: rateCheck.retryAfterMs, message: `Rate limited. Try again in ${Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000)} seconds.` }) }],
        };
      }

      try {
        const results = await searchDuckDuckGo(params.query, { count: params.count ?? 10, freshness: params.freshness, site: params.site });
        if (results.length === 0) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify({ errorKind: "no_results", message: "No results found." }) }] };
        }
        const warning = rateLimiter.isApproachingLimit() ? "\n\nRate limit approaching — consider adding delay between requests." : "";
        return { content: [{ type: "text", text: JSON.stringify(results) + warning }] };
      } catch (err) {
        const kind = err instanceof SearchError ? err.kind : "provider_unavailable";
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ errorKind: kind, message: msg }) }] };
      }
    },
  } as any);

  // ── web_search_fetch tool ────────────────────────────────────────────────

  pi.registerTool({
    name: "web_search_fetch",
    label: "Web Search Fetch",
    description:
      "Fetch and extract readable text content from a URL. " +
      "Returns the page's text content, content type, and content length.",
    promptSnippet: "Fetch the content of a web page",
    promptGuidelines: [
      "Use web_search_fetch after getting a URL from web_search to read full page content.",
      "HTML pages have tags stripped — only readable text is returned.",
      "Maximum content length is configurable (default 10000 characters).",
      "Binary content types (PDF, images, audio, video) are not supported.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The fully qualified URL to fetch" }),
      max_content_length: Type.Optional(Type.Number({ description: "Maximum characters to return (500–100000, default 10000)", minimum: 500, maximum: 100000 })),
    }),

    async execute(_id, params: { url: string; max_content_length?: number }) {
      try {
        const result = await fetchPage(params.url, params.max_content_length ?? 10000);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const kind = err instanceof FetchError ? err.kind : "network_error";
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ errorKind: kind, message: msg }) }] };
      }
    },
  } as any);

  // ── Model select: hide tools when Anthropic native search is active ──────

  let isAnthropicProvider = false;

  pi.on("model_select", async (event: any, _ctx: any) => {
    const wasAnthropic = isAnthropicProvider;
    const provider = event.model?.provider ?? "";
    isAnthropicProvider = NATIVE_SEARCH_PROVIDERS.has(provider);

    if (isAnthropicProvider && !wasAnthropic) {
      // Hide MCP search tools while Anthropic native search is active
      const active = pi.getActiveTools();
      pi.setActiveTools(active.filter((t: string) => !TOOL_NAMES.includes(t)));
    } else if (!isAnthropicProvider && wasAnthropic) {
      // Restore MCP search tools when switching away from Anthropic
      const active = pi.getActiveTools();
      const toAdd = TOOL_NAMES.filter((t) => !active.includes(t));
      if (toAdd.length > 0) {
        pi.setActiveTools([...active, ...toAdd]);
      }
    }
  });
}
