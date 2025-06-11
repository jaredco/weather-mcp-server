import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

import { weatherTool } from './tools/weatherTool.js';
import { handleSummarizeEmail } from './tools/summarizeTool.js';
import { checkApiKey } from './utils/auth.js';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
app.use(express.json());

// Serve public manifest
app.use('/.well-known', express.static(path.join(__dirname, 'public/.well-known')));

// MCP server instance with tools
const mcpServer = new Server(
  {
    name: 'weather-mcp',
    version: '0.0.1'
  },
  {
    capabilities: {
      tools: {
        weatherTool: {
          description: weatherTool.description,
          inputSchema: weatherTool.inputSchema,
          outputSchema: weatherTool.outputSchema,
          handler: async (input, req) =>
            weatherTool.run(input, req, { checkApiKey })
        },
        summarize_email: {
          description: 'Summarizes an email into one sentence',
          inputSchema: {
            type: 'object',
            properties: {
              emailText: { type: 'string' }
            },
            required: ['emailText']
          },
          outputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' }
            },
            required: ['summary']
          },
          handler: handleSummarizeEmail
        }
      }
    }
  }
);

// Register tool list handler (required)
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tool_ids: ['weatherTool', 'summarize_email']
}));

// Register tool call handler (spec-compliant)
mcpServer.setRequestHandler(CallToolRequestSchema, async ({ tool, parameters }, req) => {
  const selectedTool = mcpServer.capabilities.tools[tool];
  if (!selectedTool) {
    throw new McpError(ErrorCode.NOT_FOUND, `Tool not found: ${tool}`);
  }
  const result = await selectedTool.handler(parameters, req);
  return { output: result };
});

// 🔁 MCP-compliant request routing via Express
app.post('/', async (req, res) => {
  try {
    const result = await mcpServer.receive(req.body, req); // ✅ correct method
    res.json(result);
  } catch (err) {
    console.error('❌ MCP server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ MCP server running at http://localhost:${PORT}/`);
});