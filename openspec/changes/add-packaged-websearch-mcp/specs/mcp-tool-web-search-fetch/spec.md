## ADDED Requirements

### Requirement: web_search_fetch tool accepts a URL parameter

The `web_search_fetch` MCP tool SHALL accept the following parameters:
- `url` (string, required) — The fully qualified URL to fetch and read
- `max_content_length` (number, optional, 500–100000, default 10000) — Maximum number of characters to return

#### Scenario: URL is required

- **WHEN** the tool is called without a `url` parameter
- **THEN** it SHALL return an error indicating the URL is required

#### Scenario: Invalid URL format

- **WHEN** the tool is called with a malformed URL (e.g., missing protocol)
- **THEN** it SHALL return an error with `errorKind: "invalid_url"`

### Requirement: Page content extraction

The tool SHALL fetch the given URL and extract the page's readable text content, stripping HTML tags, scripts, and styles. It SHALL return the extracted text content up to the configured `max_content_length` limit.

#### Scenario: Successful page fetch

- **WHEN** the tool is called with a valid URL to a publicly accessible page
- **THEN** it SHALL return the page's text content with `content`, `url`, `contentType`, and `contentLength` fields

#### Scenario: Content truncation for large pages

- **WHEN** the fetched page content exceeds `max_content_length`
- **THEN** the tool SHALL truncate the content and include `truncated: true` indicating only partial content is returned

### Requirement: Content-type detection

The tool SHALL handle HTML pages and non-HTML content differently:
- For HTML pages (`text/html`), SHALL extract text content (strip HTML tags using regex or cheerio)
- For non-HTML content (JSON, XML, plain text), SHALL return raw text
- For binary content (PDF, images, audio, video), SHALL indicate unsupported content type

#### Scenario: HTML page returns extracted text

- **WHEN** the URL returns `Content-Type: text/html`
- **THEN** the tool SHALL strip HTML tags and return only readable text

#### Scenario: PDF URL is handled gracefully

- **WHEN** the URL returns `Content-Type: application/pdf`
- **THEN** the tool SHALL return an error with `errorKind: "unsupported_content_type"` and a message that PDF extraction is not supported

#### Scenario: JSON content is returned as raw text

- **WHEN** the URL returns `Content-Type: application/json`
- **THEN** the tool SHALL return the raw JSON text content

### Requirement: Error handling for HTTP failures

The tool SHALL handle the following HTTP errors gracefully:
- `404` — `"page_not_found"` with message
- `403` — `"access_denied"` with message
- `429` — `"rate_limited"` with `retryAfterMs`
- `5xx` — `"server_error"` with message
- DNS/proxy errors — `"network_error"` with message
- Timeout after 15 seconds — `"timeout"` with message

#### Scenario: 404 page

- **WHEN** the fetched URL returns a 404 status
- **THEN** the tool SHALL return `isError: true` with `errorKind: "page_not_found"`

#### Scenario: Timeout

- **WHEN** the fetched URL takes longer than 15 seconds to respond
- **THEN** the tool SHALL return `isError: true` with `errorKind: "timeout"`

### Requirement: Following redirects

The tool SHALL follow HTTP redirects (301, 302, 307, 308) up to a maximum of 5 redirects.

#### Scenario: Redirect is followed

- **WHEN** the URL returns a 302 redirect to a new URL
- **THEN** the tool SHALL fetch the redirected URL and return its content, and SHALL include the final URL in the response as `resolvedUrl`

### Requirement: Respectful crawling

The tool SHALL set a `User-Agent` header identifying itself as `GSD-WebSearch-MCP/1.0` and accept `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` content types. It SHALL NOT bypass `robots.txt` directives — the User-Agent is descriptive and NOT intentionally evasive.

#### Scenario: User-Agent is set

- **WHEN** the tool makes an HTTP request
- **THEN** the request SHALL include `User-Agent: GSD-WebSearch-MCP/1.0`
