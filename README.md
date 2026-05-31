<!-- GSD Pi - Project overview and setup guide -->

> **🔀 Fork notice:** This is a fork of [`open-gsd/gsd-pi`](https://github.com/open-gsd/gsd-pi) maintained at [`Langenhoven/gsd-pi`](https://github.com/Langenhoven/gsd-pi).  
> It implements the fix proposed in [gsd-build/gsd-2#5151](https://github.com/gsd-build/gsd-2/issues/5151) — adding OpenCode Zen and OpenCode Go as first-class providers across all setup surfaces. The issue was accepted by the upstream maintainers but never resolved. See [What's Different](#whats-different) below.

# GSD Pi

[![Fork](https://img.shields.io/badge/fork-Langenhoven%2Fgsd--pi-blue?logo=github)](https://github.com/Langenhoven/gsd-pi)
[![Upstream](https://img.shields.io/badge/upstream-open--gsd%2Fgsd--pi-lightgrey?logo=github)](https://github.com/open-gsd/gsd-pi)
[![Discord](https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/8NnkKuepmQ)
[![License: MIT](https://img.shields.io/github/license/open-gsd/gsd-pi?label=license)](https://github.com/open-gsd/gsd-pi/blob/main/LICENSE)

GSD Pi is a local-first coding agent for planning, implementing, verifying, and tracking project work from the command line.

It combines a terminal agent, project workflow tools, worktree-aware Git automation, and optional UI integrations so a project can move from idea to reviewed implementation with less manual coordination.

## Screenshots

GSD runs as a terminal-first TUI with optional browser dashboard controls.

![GSD TUI running an agent workflow](./docs/assets/screenshots/gsd-tui-agent-run.png)

![GSD TUI progress dashboard](./docs/assets/screenshots/gsd-tui-progress-dashboard.png)

![GSD TUI metrics dashboard](./docs/assets/screenshots/gsd-tui-metrics-dashboard.png)

## Feature Roll-Up

- **Guided terminal agent** — Start with `gsd`, configure providers, and run planned or quick coding sessions from your shell.
- **Autonomous project workflow** — Break work into milestones, slices, and tasks, then let auto mode plan, implement, verify, and advance.
- **Worktree-aware Git automation** — Keep implementation work isolated while preserving a reviewable main checkout.
- **Local project memory** — Store project requirements, decisions, runtime notes, generated plans, summaries, and validation evidence under `.gsd/`.
- **Multi-provider model routing** — Use the provider your team already has, with configurable defaults and per-phase model preferences.
- **Extension surface** — Add project-specific commands, tools, skills, and UI integrations through bundled or community extensions.
- **Terminal and web surfaces** — Use the TUI by default, or launch `gsd --web` when a visual control plane fits the work better than a terminal.

See [CHANGELOG.md](./CHANGELOG.md) for release-by-release fixes and [Legacy Release History](./docs/archive/legacy-release-history.md) for archived history before the `open-gsd/gsd-pi` baseline.

## What's Different

This fork adds one thing missing from the upstream: **first-class onboarding for OpenCode Zen and OpenCode Go providers.**

The `opencode` and `opencode-go` providers already existed in the model registry with full model catalogs, but were invisible to users. This fix surfaces them across all setup paths:

| Surface | What changed |
|---------|-------------|
| `/gsd keys` dashboard | Listed as LLM providers under "OpenCode Zen" / "OpenCode Go" |
| `/gsd keys add opencode` | Accepts and validates `OPENCODE_API_KEY` |
| Web onboarding (`gsd config`) | Shown with API-key setup in the provider catalog |
| Env hydration | Keys in `auth.json` auto-loaded into `process.env` on startup |
| Provider docs | Setup instructions in English, Chinese, and Gitbook docs |

The fix was originally proposed in [gsd-build/gsd-2#5151](https://github.com/gsd-build/gsd-2/issues/5151) but never implemented upstream.

## Build & Install

This fork is built from source. Upstream install methods (`npx @opengsd/gsd-pi`) install the upstream package without these changes.

If you already have a global `gsd` from the upstream npm package, unlink it first:

```bash
npm uninstall -g @opengsd/gsd-pi
```

Then clone, build, and link:

```bash
git clone https://github.com/Langenhoven/gsd-pi.git
cd gsd-pi
pnpm install
npm run build:core
npm link
```

See [NEW.md](./NEW.md) for detailed build and install steps.

## Status

This repository is starting a new development baseline at version `1.0.0` under the `open-gsd/gsd-pi` project.

Older release history has been archived outside the active changelog so new work can be reviewed from a clean project surface.

## Uninstall

Remove the global package and optional local GSD state files.

macOS / Linux:

```bash
npm uninstall -g @opengsd/gsd-pi gsd-pi
rm -rf ~/.gsd
```

If you installed GSD with pnpm, use pnpm for the pnpm-owned package. If pnpm reports that its global bin directory is not on `PATH`, run `pnpm setup`, restart your shell, then retry.

```bash
pnpm remove -g @opengsd/gsd-pi
npm uninstall -g gsd-pi
rm -rf ~/.gsd
```

Windows PowerShell:

```powershell
npm uninstall -g @opengsd/gsd-pi gsd-pi
Remove-Item "$env:USERPROFILE\.gsd" -Recurse -Force -ErrorAction SilentlyContinue
```

## Quick Start

```bash
gsd
```

Run the setup flow, choose your preferred model provider, and open a project directory. GSD stores project planning and runtime state in `.gsd/`.

For a full first-run walkthrough, see [Getting Started With gsd-pi](./docs/user-docs/getting-started.md).

## Common Session Commands

Start GSD from your shell:

```bash
gsd
```

Then use slash commands inside the GSD session:

```text
/gsd config
/gsd auto
/gsd quick "Describe the task"
/gsd status
```

## What GSD Pi Does

- Plans work into milestones, slices, and tasks.
- Runs coding sessions with project context and verification steps.
- Uses Git worktrees to isolate implementation work.
- Tracks project state in a local database with markdown projections for review.
- Supports extension-based tools and provider integrations.
- Produces artifacts such as plans, summaries, validation notes, and reports.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/` | Core runtime resources and bundled extensions |
| `packages/` | Workspace packages used by the CLI, agent, TUI, RPC, and native bridge |
| `native/` | Native engine packaging and platform binaries |
| `studio/` | Desktop studio app |
| `web/` | Web UI and API surface |
| `docs/` | User and developer documentation |
| `scripts/` | Build, release, migration, and maintenance scripts |

## Development

```bash
pnpm install
npm run build:core      # Full build
npm test                # Run tests
```

Alternative partial build (faster for iterating on specific packages):

```bash
npm run build
```

Before opening a pull request, run:

```bash
npm run verify:fast     # CI fast-gates locally (scans + policy)
npm run verify:pr       # Fast loop: build + typecheck + unit tests
npm run verify:merge    # Before PR review: full CI blocking parity
```

## Versioning

The active public baseline starts at `1.0.0`.

Historical tags and archived refs may exist for traceability, but active release notes should be written from this baseline forward.

## Community

Join the [GSD Discord community](https://discord.gg/8NnkKuepmQ).

## Star History

<a href="https://www.star-history.com/?repos=open-gsd%2Fgsd-pi&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=open-gsd/gsd-pi&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=open-gsd/gsd-pi&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=open-gsd/gsd-pi&type=date&legend=top-left" />
 </picture>
</a>

## License

MIT
