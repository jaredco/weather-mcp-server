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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Handle direct tool calls (for n8n integration)
app.post('/', async (req, res) => {
  try {
    console.log('📦 Tool input:', req.body);
    
    // Handle direct tool calls
    if (req.body.tool || req.body.name) {
      const toolName = req.body.tool || req.body.name;
      const parameters = req.body.parameters || req.body.arguments || req.body;
      
      let result;
      
      switch (toolName) {
        case 'weatherTool':
          result = await weatherTool.run(parameters, req, { checkApiKey });
          break;
          
        case 'summarize_email':
          result = await handleSummarizeEmail(parameters, req);
          break;
          
        default:
          // If no tool specified, assume it's a weather request
          if (parameters.location || parameters.query_type) {
            result = await weatherTool.run(parameters, req, { checkApiKey });
          } else {
            throw new Error(`Unknown tool: ${toolName}`);
          }
      }
      
      console.log('🌦 MCP WeatherTool responded:', result);
      res.json(result);
      return;
    }
    
    // Handle MCP protocol requests
    const { method, params } = req.body;
    
    if (method === 'tools/list') {
      res.json({
        tools: [
          {
            name: 'weatherTool',
            description: weatherTool.description,
            inputSchema: weatherTool.inputSchema
          },
          {
            name: 'summarize_email',
            description: 'Summarizes an email into one sentence',
            inputSchema: {
              type: 'object',
              properties: {
                emailText: { type: 'string' }
              },
              required: ['emailText']
            }
          }
        ]
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'weatherTool':
          result = await weatherTool.run(args, req, { checkApiKey });
          break;
          
        case 'summarize_email':
          result = await handleSummarizeEmail(args, req);
          break;
          
        default:
          throw new Error(`Tool not found: ${name}`);
      }
      
      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } else {
      res.status(400).json({ error: 'Unsupported method', method: method });
    }
    
  } catch (err) {
    console.error('❌ MCP server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Serve tool manifest
app.get('/.well-known/tool-manifest.json', (req, res) => {
  res.json({
    tools: [
      {
        name: 'weatherTool',
        description: weatherTool.description,
        parameters: weatherTool.inputSchema
      },
      {
        name: 'summarize_email',
        description: 'Summarizes an email into one sentence',
        parameters: {
          type: 'object',
          properties: {
            emailText: { type: 'string' }
          },
          required: ['emailText']
        }
      }
    ]
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ MCP server running at http://localhost:${PORT}/`);
});