## ADDED Requirements

### Requirement: web_search_fetch tool accepts a URL parameter

The `web_search_fetch` MCP tool SHALL accept one required parameter:
- `url` (string, required) — The fully qualified URL to fetch and read

#### Scenario: URL is required

- **WHEN** the tool is called without a `url` parameter
- **THEN** it SHALL return an error indicating the URL is required

#### Scenario: Invalid URL format

- **WHEN** the tool is called with a malformed URL (e.g., missing protocol)
- **THEN** it SHALL return an error with `errorKind: "invalid_url"`

### Requirement: Page content extraction

The tool SHALL fetch the given URL and extract the page's readable text content, stripping HTML tags, scripts, and styles. It SHALL return the extracted text content up to a configurable limit of 100,000 bytes.

#### Scenario: Successful page fetch

- **WHEN** the tool is called with a valid URL to a publicly accessible page
- **THEN** it SHALL return the page's text content with `content`, `url`, `contentType`, and `contentLength` fields

#### Scenario: Content truncation for large pages

- **WHEN** the fetched page content exceeds 100,000 bytes
- **THEN** the tool SHALL truncate the content and include a truncated field indicating only partial content is returned

### Requirement: Content-type detection

The tool SHALL handle HTML pages and plain-text/JSON pages differently:
- For HTML pages, SHALL extract text content (strip HTML)
- For non-HTML content (JSON, XML, PDF), SHALL return raw text or indicate unsupported content type

#### Scenario: HTML page returns extracted text

- **WHEN** the URL returns `Content-Type: text/html`
- **THEN** the tool SHALL strip HTML tags and return only readable text

#### Scenario: PDF URL is handled gracefully

- **WHEN** the URL returns `Content-Type: application/pdf`
- **THEN** the tool SHALL return an error with `errorKind: "unsupported_content_type"` and a message that PDF extraction is not supported (PDF content can be fetched by other tools)

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

### Requirement: Rate limit awareness

The tool SHALL respect `Robots.txt` minimally — it SHALL set a `User-Agent` header identifying itself as `GSD-WebSearch-MCP/1.0` and accept `text/html,application/xhtml+xml` content types.

#### Scenario: User-Agent is set

- **WHEN** the tool makes an HTTP request
- **THEN** the request SHALL include `User-Agent: GSD-WebSearch-MCP/1.0`
