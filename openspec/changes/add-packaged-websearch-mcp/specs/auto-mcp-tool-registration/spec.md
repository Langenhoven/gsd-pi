## ADDED Requirements

### Requirement: Websearch MCP server is auto-registered at session start

A GSD extension at `src/resources/extensions/websearch-mcp/` SHALL register a `session_start` hook that starts or advertises the websearch MCP server's tools to the coding agent without requiring manual MCP client configuration.

#### Scenario: Extension manifest exists

- **WHEN** the extension loader scans `src/resources/extensions/websearch-mcp/extension-manifest.json`
- **THEN** it SHALL contain valid metadata: `{ id: "websearch-mcp", name: "WebSearch MCP", tier: "bundled", provides: { tools: ["web_search", "web_search_fetch"] } }`

#### Scenario: Tools are advertised to agent

- **WHEN** a session starts and `pi.on("session_start", ...)` fires
- **THEN** the extension SHALL make `web_search` and `web_search_fetch` available to the agent's tool list

#### Scenario: No startup delay for non-search sessions

- **WHEN** a user starts a session that does not invoke any search tool
- **THEN** the websearch MCP server SHALL NOT be started — it is lazily initialized on first tool call

### Requirement: Native search awareness

The auto-registration SHALL respect the native Anthropic web search mechanism. When native `web_search_20250305` is active (i.e., when the provider is Anthropic and `preferBraveSearch()` is false), the MCP `web_search` tool SHALL be hidden from the agent to avoid duplicate search tools.

#### Scenario: MCP tool hidden when native search is active

- **WHEN** the active model provider is `anthropic` and `preferBraveSearch()` returns false
- **THEN** `web_search` and `web_search_fetch` SHALL be removed from `pi.getActiveTools()`

#### Scenario: MCP tool restored when switching away from Anthropic

- **WHEN** the provider switches away from Anthropic (e.g., to OpenAI)
- **THEN** `web_search` and `web_search_fetch` SHALL be added back to the active tools

### Requirement: Search-the-web awareness

When the existing `search-the-web` extension's tools are active (Brave/Tavily/Ollama are configured), the MCP `web_search` tool SHALL be hidden to avoid duplicate search capabilities confusing the agent.

#### Scenario: MCP tool hidden when search-the-web is active

- **WHEN** `BRAVE_API_KEY`, `TAVILY_API_KEY`, or `OLLAMA_API_KEY` is set and the user has chosen those providers
- **THEN** the MCP `web_search` tool SHALL be removed from the active tool list to avoid duplication

#### Scenario: MCP tool shown when no search key is configured

- **WHEN** no search API key (Brave, Tavily, Ollama, Google) is configured and no native Anthropic search is active
- **THEN** the MCP `web_search` and `web_search_fetch` tools SHALL be added to the active tool list

### Requirement: MCP server process lifecycle

The extension SHALL manage the websearch MCP server process lifecycle — starting it as a child process when needed and stopping it on session shutdown.

#### Scenario: Server starts on first tool call

- **WHEN** the agent invokes `web_search` for the first time in a session
- **THEN** the extension SHALL spawn the MCP server process (e.g., `node packages/websearch-mcp-server/dist/cli.js`) and route the tool call to it

#### Scenario: Server stops on session shutdown

- **WHEN** `session_shutdown` fires
- **THEN** the MCP server child process SHALL be terminated with SIGTERM
