import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export async function start_http_server(server: Server, port: number, endpoint: string) {
    const app = express();
    app.use(express.json());
    
    app.post('/rest', async (req: Request, res: Response) => {
      // In stateless mode, create a new instance of transport and server for each request
      // to ensure complete isolation. A single instance would cause request ID collisions
      // when multiple clients connect concurrently.
      
      try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on('close', () => {
          console.log('Request closed');
          transport.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });
    
    app.get('/rest', async (req: Request, res: Response) => {
      console.log('Received GET MCP request');
      res.status(405).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      });
    });
    
    app.delete('/rest', async (req: Request, res: Response) => {
      console.log('Received DELETE MCP request');
      res.status(405).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      });
    });
    
    
    // Start the server
    app.listen(port, () => {
      console.log(`MCP Stateless Streamable HTTP Server listening on port ${port}`);
    });
}

export function getParams() {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key] = value;
    }
  });
  return args;
}

export function getParamValue(name: string) {
  let args = getParams();
  if (!args || typeof args !== "object" || Object.keys(args).length === 0) {
    args = {};
  }

  const value =
    args[name] ||
    args[name.toUpperCase()] ||
    args[name.toLowerCase()] ||
    process.env[name] ||
    process.env[name.toUpperCase()] ||
    process.env[name.toLowerCase()] ||
    "";

  return value;
}