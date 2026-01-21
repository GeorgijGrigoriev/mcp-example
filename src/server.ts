#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import * as os from "os";
import { randomUUID } from "node:crypto";

/**
 * Create MCP server instance with tools
 */
function createServer() {
  const server = new Server(
    {
      name: "hostname-ip-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_hostname",
          description: "Returns the hostname of the machine where the server is running",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "get_ip_address",
          description: "Returns the primary IP address of the machine where the server is running",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "get_hostname": {
          const hostname = os.hostname();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ hostname }, null, 2),
              },
            ],
          };
        }

        case "get_ip_address": {
          const interfaces = os.networkInterfaces();
          let ipAddress: string | null = null;

          // Find the first non-loopback IPv4 address
          for (const interfaceName in interfaces) {
            const addresses = interfaces[interfaceName];
            if (addresses) {
              for (const addr of addresses) {
                if (addr.family === "IPv4" && !addr.internal) {
                  ipAddress = addr.address;
                  break;
                }
              }
              if (ipAddress) {
                break;
              }
            }
          }

          if (!ipAddress) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { error: "No external IPv4 address found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ipAddress }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start server in stdio mode
 */
async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Hostname/IP Server running on stdio");
}

/**
 * Start server in HTTP mode
 */
async function startHttpServer() {
  const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3000;
  const app = createMcpExpressApp();
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // POST endpoint for MCP requests
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`Session initialized with ID: ${sid}`);
            transports[sid] = transport;
          },
        });

        // Set up cleanup on close
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`Transport closed for session ${sid}`);
            delete transports[sid];
          }
        };

        // Connect server to transport
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      // Handle request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // GET endpoint for SSE streams
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // DELETE endpoint for session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  app.listen(port, (error?: Error) => {
    if (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
    console.log(`MCP Hostname/IP Server running on HTTP port ${port}`);
    console.log(`Endpoint: http://localhost:${port}/mcp`);
  });

  // Cleanup on shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down server...");
    for (const sessionId in transports) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    process.exit(0);
  });
}

/**
 * Main entry point
 */
async function main() {
  const transport = process.env.MCP_TRANSPORT || "stdio";

  if (transport === "http") {
    await startHttpServer();
  } else if (transport === "stdio") {
    await startStdioServer();
  } else {
    console.error(`Unknown transport mode: ${transport}. Use 'stdio' or 'http'`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
