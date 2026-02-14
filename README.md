# speclan-essentials

Companion tools that enhance the daily agentic AI workflow with [SPECLAN](https://speclan.net) — the VS Code extension that turns structured specifications into AI-ready prompts.

SPECLAN sits between business intent and AI coding agents as the missing middle layer. It manages specification trees (goals, features, requirements, scenarios, tests) as plain Markdown files in your project folder — no database, no server, no lock-in. These tools extend that workflow beyond the extension itself.

## speclan-mcp-bridge

A stdio-to-HTTP bridge that exposes SPECLAN's 42+ MCP tools to any AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io/) over stdio — such as Claude Code, Cursor, or Windsurf.

### Why?

The SPECLAN VS Code extension ships with an HTTP-based MCP server (`http-mcp`). Many AI coding agents, however, expect MCP servers to communicate over stdio. This bridge translates between the two: it connects to SPECLAN's HTTP MCP endpoint and re-exposes every tool via stdio transport.

```
AI Agent  <──stdio──>  speclan-mcp-bridge  <──HTTP──>  SPECLAN VS Code Extension
```

### Setup

```bash
npm install
npm run build:mcp-bridge
```

This produces a self-contained bundle at `dist/speclan-mcp-bridge.mjs`.

### Configuration

Add the bridge to your AI agent's MCP config. For Claude Code, add to `~/.claude.json` or your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "speclan": {
      "command": "node",
      "args": ["/absolute/path/to/dist/speclan-mcp-bridge.mjs"]
    }
  }
}
```

The bridge connects to `http://localhost:8085` by default. Override with the `SPECLAN_MCP_URL` environment variable:

```json
{
  "mcpServers": {
    "speclan": {
      "command": "node",
      "args": ["/absolute/path/to/dist/speclan-mcp-bridge.mjs"],
      "env": {
        "SPECLAN_MCP_URL": "http://localhost:9000"
      }
    }
  }
}
```

### Development

Run directly from source without bundling:

```bash
npm run mcp-bridge
```

### Prerequisites

- Node.js >= 20
- The SPECLAN VS Code extension running with its HTTP MCP server active

## License

MIT
