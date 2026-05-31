## ADDED Requirements

### Requirement: opencode-search added to PROVIDER_REGISTRY

The `opencode-search` provider SHALL be added to `PROVIDER_REGISTRY` in `src/resources/extensions/gsd/key-manager.ts` with:
- `id: "opencode-search"`
- `label: "OpenCode Search"`
- `category: "search"`
- `envVar: "OPENCODE_API_KEY"`
- `authMode: "apiKey"` (omitted, defaults to apiKey)
- `dashboardUrl: "opencode.ai/auth"`

#### Scenario: opencode-search appears in /gsd keys dashboard

- **WHEN** a user runs `/gsd keys` or opens the keys dashboard
- **THEN** `OpenCode Search` SHALL appear under the "Search Providers" section

#### Scenario: opencode-search appears in dashboard key groups

- **WHEN** the dashboard iterates `PROVIDER_REGISTRY` and groups providers by category
- **THEN** `opencode-search` SHALL be listed alongside `tavily` and `brave` under the `"search"` category

### Requirement: opencode-search added to TEST_ENDPOINTS

A test endpoint entry SHALL be added to the `TEST_ENDPOINTS` map in `key-manager.ts` for `opencode-search` that probes the OpenCode search/chat endpoint.

#### Scenario: API key validation succeeds

- **WHEN** the user runs `/gsd keys` and the validity check for `opencode-search` is triggered
- **THEN** a test request SHALL be made to `https://api.opencode.ai/v1/search` (or equivalent endpoint) with the stored `OPENCODE_API_KEY`

### Requirement: opencode-search in onboarding wizard

The `opencode-search` provider SHALL be added to the `OPTIONAL_SECTION_CATALOG` in `src/web/onboarding-service.ts` under the `web_search` section, so users see it during setup.

#### Scenario: opencode-search appears in web onboarding

- **WHEN** a user runs the web onboarding wizard
- **THEN** the "Web search" section SHALL include `OpenCode Search` as an option with its `OPENCODE_API_KEY` env var

### Requirement: opencode-search in credential loading

The `opencode-search` → `OPENCODE_API_KEY` mapping SHALL be added to the `AUTH_ENV_KEYS` table in `packages/mcp-server/src/tool-credentials.ts` so stored credentials are loaded at server startup.

#### Scenario: Stored OPENCODE_API_KEY is loaded for opencode-search

- **WHEN** `loadStoredCredentialEnvKeys()` runs and `auth.json` contains an `opencode-search` entry
- **THEN** the value SHALL be loaded into `process.env.OPENCODE_API_KEY`

#### Scenario: Existing opencode key also satisfies opencode-search

- **WHEN** `auth.json` contains an `opencode` entry with an API key
- **THEN** `loadStoredCredentialEnvKeys()` SHALL load `OPENCODE_API_KEY` from the existing `opencode` provider entry (this already works — the new `opencode-search` entry is additive)

### Requirement: opencode-search display name

A display name entry for `opencode-search` SHALL be added to `packages/pi-coding-agent/src/core/provider-display-names.ts` so the provider renders with "OpenCode Search" in UI contexts.

#### Scenario: Display name resolves

- **WHEN** the display name utility is called with `"opencode-search"`
- **THEN** it SHALL return `"OpenCode Search"`
