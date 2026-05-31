## ADDED Requirements

### Requirement: Websearch MCP server config is registered via bundled extension

A GSD extension at `src/resources/extensions/websearch-mcp/` SHALL register the websearch MCP server's configuration with the GSD runtime, making it available as a packaged MCP tool without manual MCP client configuration.

#### Scenario: Extension manifest exists

- **WHEN** the extension loader scans `src/resources/extensions/websearch-mcp/extension-manifest.json`
- **THEN** it SHALL contain valid metadata: `{ id: "websearch-mcp", name: "WebSearch MCP", tier: "bundled" }`

#### Scenario: MCP server config is registered

- **WHEN** the extension initializes
- **THEN** it SHALL register an MCP tool config with `command`, `args`, and `env` that describes how to spawn the websearch MCP server process

### Requirement: Lazy process startup

The websearch MCP server process SHALL NOT be spawned at session start. It SHALL be spawned lazily on the first tool invocation. The GSD runtime SHALL handle process lifecycle — spawning on demand and keeping the process alive for the session duration.

#### Scenario: Server starts on first tool call

- **WHEN** the agent invokes `web_search` for the first time in a session
- **THEN** the GSD runtime SHALL spawn the MCP server child process using the registered config

#### Scenario: No startup delay for non-search sessions

- **WHEN** a user starts a session that does not invoke any search tool
- **THEN** the websearch MCP server SHALL NOT be started

### Requirement: Visibility respects native Anthropic search

When native Anthropic web search (`web_search_20250305`) is active (the model provider is Anthropic), the MCP `web_search` and `web_search_fetch` tools SHALL be hidden from the agent's tool list to avoid duplicate search capabilities.

#### Scenario: MCP tool hidden when Anthropic native search is available

- **WHEN** the active model provider is `anthropic`
- **THEN** `web_search` and `web_search_fetch` SHALL be removed from `pi.getActiveTools()`

#### Scenario: MCP tool restored when switching away from Anthropic

- **WHEN** the provider switches away from `anthropic` to another provider (e.g., `openai`)
- **THEN** `web_search` and `web_search_fetch` SHALL be added back to the active tools

### Requirement: MCP tools always visible when no native search is active

When the provider is NOT Anthropic (or native Anthropic search is not available), the `web_search` and `web_search_fetch` tools SHALL be visible in the agent's tool list regardless of whether other search tools (Brave, Tavily, Ollama, Google) are also available. The agent selects which tool to use.

#### Scenario: Tools visible alongside search-the-web tools

- **WHEN** `BRAVE_API_KEY` is set and the `search-the-web` extension's Brave tools are active
- **THEN** the MCP `web_search` and `web_search_fetch` tools SHALL also be visible — both are available for the agent to choose

#### Scenario: Tools visible when no search keys exist

- **WHEN** no search API key (Brave, Tavily, Ollama, Google) is configured
- **THEN** the MCP `web_search` and `web_search_fetch` tools SHALL be visible as the only web search tools

### Requirement: Process lifecycle on session shutdown

When the session ends, the GSD runtime SHALL terminate the MCP server child process.

#### Scenario: Server stops on session shutdown

- **WHEN** `session_shutdown` fires or the agent disconnects
- **THEN** the MCP server child process SHALL be terminated with SIGTERM
