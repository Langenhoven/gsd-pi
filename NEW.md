# Build & Install

## Prerequisites

- **Node.js** v18+ (v20+ recommended)
- **pnpm** — install once: `npm install -g pnpm`

## One-time Setup

```bash
# Clone the fork
git clone https://github.com/Langenhoven/gsd-pi.git
cd gsd-pi

# Install dependencies
pnpm install

# Build everything
npm run build:core
```

The `build:core` command runs the full pipeline:

```
contracts → pi packages → RPC client → MCP server → daemon → cloud gateway → tsc → copy resources
```

## Make the binary available globally

```bash
npm link
```

This links the `gsd` and `gsd-cli` commands to `dist/loader.js` in your repo.

## Verify

```bash
gsd --version
# → 1.0.2
```

## Run tests

```bash
npm test
```

## Day-to-day after pulling changes

```bash
git pull
pnpm install            # if dependencies changed
npm run build:core      # rebuild
```

## Unlink

If you want to revert to the upstream npm package:

```bash
npm unlink -g @opengsd/gsd-pi
npm install -g @opengsd/gsd-pi@latest
```
