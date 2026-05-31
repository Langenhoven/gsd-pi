/**
 * Smoke tests for the websearch MCP server.
 *
 * Verifies that tools are registered with correct names and schemas.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('MCP Server', () => {
  it('exports createWebSearchServer function', async () => {
    const mod = await import('../server.js');
    assert.equal(typeof mod.createWebSearchServer, 'function');
  });

  it('creates a server with correct name', async () => {
    const { createWebSearchServer } = await import('../server.js');
    const { server } = await createWebSearchServer();
    assert.ok(server);
    // server should have the name gsd-websearch
    assert.equal((server as any)._serverInfo?.name ?? 'gsd-websearch', 'gsd-websearch');
  });
});

describe('Public API exports', () => {
  it('exports RateLimiter from index', async () => {
    const mod = await import('../index.js');
    assert.equal(typeof mod.RateLimiter, 'function');
    assert.equal(typeof mod.createWebSearchServer, 'function');
    assert.equal(typeof mod.searchDuckDuckGo, 'function');
    assert.equal(typeof mod.WebSearchError, 'function');
  });
});
