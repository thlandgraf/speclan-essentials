import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MCP_HTTP_URL = process.env.SPECLAN_MCP_URL ?? "http://localhost:8085";

/** Log to stderr (stdout is reserved for MCP protocol) */
function log(msg: string) {
  process.stderr.write(`[speclan-mcp-bridge] ${msg}\n`);
}

interface RemoteTool {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

interface ToolsResponse {
  tools: RemoteTool[];
}

async function fetchToolsWithRetry(
  url: string,
  maxRetries = 3,
  delayMs = 1000
): Promise<ToolsResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${url}/tools`);
      if (!res.ok)
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as ToolsResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Failed to fetch tools (attempt ${attempt}/${maxRetries}): ${msg}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw new Error(
          `Cannot connect to Speclan HTTP MCP at ${url}. Is the server running? (${msg})`
        );
      }
    }
  }
  throw new Error("Unreachable");
}

async function main() {
  log(`Connecting to Speclan HTTP MCP at ${MCP_HTTP_URL}`);

  const toolsData = await fetchToolsWithRetry(MCP_HTTP_URL);
  log(`Loaded ${toolsData.tools.length} tools`);

  const server = new Server(
    { name: "speclan-mcp-bridge", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolsData.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: convertToJsonSchema(tool.schema),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments as Record<string, unknown>) ?? {};

    log(`Calling tool: ${toolName}`);

    const callRes = await fetch(`${MCP_HTTP_URL}/tools/${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    const result = (await callRes.json()) as {
      success: boolean;
      result?: {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      error?: string;
    };

    if (result.success && result.result) {
      return {
        content: result.result.content.map((c) => ({
          type: "text" as const,
          text: c.text,
        })),
        isError: result.result.isError,
      };
    } else {
      return {
        content: [
          { type: "text" as const, text: result.error ?? "Unknown error" },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Bridge running on stdio");
}

/**
 * Convert Zod-serialized schema to JSON Schema.
 *
 * Speclan's HTTP /tools endpoint returns tool schemas as serialized Zod objects.
 * MCP clients expect standard JSON Schema in inputSchema.
 */
function convertToJsonSchema(zodSchema?: Record<string, unknown>): {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
} {
  if (!zodSchema) {
    return { type: "object", properties: {} };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(zodSchema)) {
    const propSchema = value as { type?: string; def?: { type?: string } };
    const propType = propSchema.type ?? propSchema.def?.type;

    if (propType === "optional") {
      properties[key] = convertZodTypeToJsonSchema(propSchema);
    } else {
      required.push(key);
      properties[key] = convertZodTypeToJsonSchema(propSchema);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function convertZodTypeToJsonSchema(
  zodType: Record<string, unknown>
): Record<string, unknown> {
  const type = (
    zodType.type ?? (zodType.def as Record<string, unknown>)?.type
  ) as string;

  switch (type) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: { type: "string" } };
    case "object":
      return { type: "object" };
    case "optional": {
      const innerType = (zodType.def as Record<string, unknown>)
        ?.innerType as Record<string, unknown>;
      return convertZodTypeToJsonSchema(innerType ?? {});
    }
    case "enum": {
      const options = (zodType as Record<string, unknown>).options as string[];
      return { type: "string", enum: options };
    }
    default:
      return { type: "string" };
  }
}

main().catch((error) => {
  log(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
