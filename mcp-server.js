// mcp-server.js
// ESM required: ensure "type": "module" in package.json

import express from 'express';
import { weatherTool } from './tools/weatherTool.js';
import { WeatherError } from './tools/weatherTool.js';
import { weatherPlanningTool } from './tools/weatherPlanningTool.js';
import { getUsageMetrics, logToolUsage, recordUsage } from './utils/logger.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configure trust proxy BEFORE rate limiting middleware
// Set to false for local development (no proxy)
// For production behind a proxy, use: 1, 'loopback', or specific IP ranges
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || false);

import rateLimit from 'express-rate-limit';
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.use(express.json({ limit: '256kb' }));

// prevent caches on API responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Server-Version', '1.0.1');
  next();
});

/* ---------- CORS (broad for demos; tighten if needed) ---------- */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // allowlist in prod
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, mcp-session-id, x-bypass-origin');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------- Origin Validation (selective - only /tools/* and /mcp POST routes) ---------- */
app.use((req, res, next) => {
  // Only apply to /tools/* and /mcp POST routes
  const isToolsRoute = req.path.startsWith('/tools/');
  const isMcpRoute = req.path === '/mcp';
  const isPostMethod = req.method === 'POST';

  if (!(isToolsRoute || isMcpRoute) || !isPostMethod) {
    return next(); // Skip validation for other routes
  }

  const origin = req.headers.origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://claude.ai')
    .split(',').map(value => value.trim()).filter(Boolean);

  // Server-to-server MCP clients commonly omit Origin. Browser-originated calls
  // are accepted only from Claude or an explicitly configured deployment origin.
  if (!origin || allowedOrigins.includes(origin)) return next();
  return resErr(res, 403, 'INVALID_ORIGIN', 'Origin is not allowed.');
});

/* ---------- Small helpers ---------- */
function resErr(res, httpStatus, code, message, hint = null, retryAfterSeconds = null) {
  const payload = { error: { code, message, hint, retry_after: retryAfterSeconds } };
  if (retryAfterSeconds) res.set('Retry-After', String(retryAfterSeconds));
  return res.status(httpStatus).json(payload);
}

function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined));
}

const weatherCache = new Map();
function cacheKey(toolName, input) {
  return `${toolName}:${JSON.stringify(Object.keys(input || {}).sort().reduce((result, key) => {
    result[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
    return result;
  }, {}))}`;
}
function cacheTtl(input) {
  if (input.query_type === 'current' || input.query_type === 'rain_check') return 2 * 60_000;
  if (input.query_type === 'sunrise_sunset') return 6 * 60 * 60_000;
  return 15 * 60_000;
}
function validateInput(toolName, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.location !== 'string' || !input.location.trim() || input.location.length > 200) {
    throw new WeatherError('INVALID_INPUT', 'location must be a non-empty string.');
  }
  if (toolName === 'weatherTool') {
    if (!['current', 'forecast', 'multi_day', 'sunrise_sunset', 'rain_check'].includes(input.query_type)) {
      throw new WeatherError('INVALID_INPUT', 'query_type must be current, forecast, multi_day, sunrise_sunset, or rain_check.');
    }
    if (input.num_days !== undefined && (!Number.isInteger(input.num_days) || input.num_days < 1 || input.num_days > 14)) {
      throw new WeatherError('INVALID_INPUT', 'num_days must be an integer from 1 through 14.');
    }
    if (input.tp !== undefined && ![1, 3, 6, 12, 24].includes(input.tp)) {
      throw new WeatherError('INVALID_INPUT', 'tp must be one of 1, 3, 6, 12, or 24.');
    }
    if (input.query_type === 'forecast' && (typeof input.date !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(input.date))) {
      throw new WeatherError('INVALID_INPUT', 'date is required in YYYY-MM-DD format when query_type is forecast.');
    }
  }
  return { ...input, location: input.location.trim() };
}
async function runTool(toolName, input, req) {
  const tool = toolName === 'weatherTool' ? weatherTool : toolName === 'weatherPlanningTool' ? weatherPlanningTool : null;
  if (!tool) throw new WeatherError('TOOL_NOT_FOUND', `Unknown tool: ${toolName}`);
  const normalized = validateInput(toolName, input);
  const key = cacheKey(toolName, normalized);
  const cached = weatherCache.get(key);
  const queryType = normalized.query_type || 'planning';
  if (cached && cached.expiresAt > Date.now()) {
    recordUsage({ tool: toolName, queryType, success: true, cacheHit: true });
    return cached.value;
  }
  try {
    recordUsage({ tool: toolName, queryType, upstreamRequest: true });
    const value = await tool.run(normalized);
    weatherCache.set(key, { value, expiresAt: Date.now() + cacheTtl(normalized) });
    recordUsage({ tool: toolName, queryType, success: true });
    logToolUsage({ tool: toolName, input: normalized, output: true, req });
    return value;
  } catch (error) {
    recordUsage({ tool: toolName, queryType, error });
    logToolUsage({ tool: toolName, input: normalized, error, req });
    throw error;
  }
}
function toolError(error) {
  if (error instanceof WeatherError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: 'INTERNAL_ERROR', message: 'WeatherTrax encountered an unexpected error. Please try again later.', retryable: true };
}

/* ---------- Unified manifest (reused for Claude + others) ---------- */
const manifest = {
  name: 'weathertrax',
  version: '1.0.1',
  description:
    'Fast current conditions and multi‑day forecasts by city or lat/long. Token‑frugal JSON with clear, structured errors.',
  homepage_url: 'https://github.com/jaredco/weather-mcp-server',
  legal: { privacy_policy_url: 'https://mcp-weathertrax.jaredco.com/privacy' },
  contact: { support_url: 'https://github.com/jaredco/weather-mcp-server/issues' },
  transport: { http: { streaming: true } },
  tools: [
    {
      name: 'weatherTool',
      title: 'WeatherTrax',
      description: 'Get current conditions, a 1–14 day forecast, sunrise and sunset, or rain timing for a location.',
      parameters: weatherTool.inputSchema, // keep schemas in one place
      output: weatherTool.outputSchema,
      annotations: { title: 'WeatherTrax weather', readOnlyHint: true, destructiveHint: false, openWorldHint: true }
    },
    {
      name: 'weatherPlanningTool',
      title: 'WeatherTrax Planning',
      description: 'Get a seven-day forecast for planning an outdoor activity, trip, or work schedule.',
      parameters: weatherPlanningTool.inputSchema,
      output: weatherPlanningTool.outputSchema,
      annotations: { title: 'WeatherTrax planning forecast', readOnlyHint: true, destructiveHint: false, openWorldHint: true }
    }
  ]
};

 
app.get('/', (_req, res) => {
  res.type('html').send(
    `<h1>WeatherTrax MCP</h1>
     <p>JSON‑RPC: POST / & POST /mcp</p>
     <p>Manifest: <a href="/.well-known/mcp/manifest">/.well-known/mcp/manifest</a></p>
     <p>Docs: <a href="https://github.com/jaredco-ai/weather-mcp-server">GitHub</a></p>`
  );
});

/* ---------- Logo & Favicon ---------- */
app.get('/logo.svg', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'weathertrax-logo.svg'));
});

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'weathertrax-logo.svg'));
});



/* ---------- Healthcheck ---------- */
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    version: manifest.version,
    upstream: 'ok'
  });
});

/* ---------- Privacy Policy ---------- */
app.get('/privacy', async (_req, res) => {
  try {
    const privacyPath = join(__dirname, 'public', 'privacy.html');
    const privacyContent = await readFile(privacyPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(privacyContent);
  } catch (err) {
    console.error('Error serving privacy policy:', err);
    res.status(404).send('Privacy policy not found');
  }
});

/* ---------- ChatGPT App UI (Skybridge) ---------- */
// Serves the WeatherTrax UI for embedding in ChatGPT Apps.
// Content-Type MUST be 'text/html+skybridge' for ChatGPT iframe rendering.
app.get('/ui/weathertrax', async (_req, res) => {
  try {
    const htmlPath = join(__dirname, 'public', 'weathertrax.html');
    const htmlContent = await readFile(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html+skybridge');
    res.send(htmlContent);
  } catch (err) {
    console.error('Error serving UI:', err);
    res.status(500).send('Failed to load UI');
  }
});

/* ---------- Manifest endpoints (single source of truth) ---------- */
app.get('/.well-known/mcp/manifest', (_req, res) => res.json(manifest));
app.get('/.well-known/tool-manifest.json', (_req, res) => res.json(manifest)); // keep old path working
app.get('/.well-known/mcp/tools', (_req, res) => res.json(manifest.tools));    // convenience listing
app.get('/metrics', (_req, res) => res.json(getUsageMetrics()));

/* ---------- Direct HTTP tool call (n8n-friendly) ---------- */
app.post('/tools/weatherTool', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept raw `{location, query_type, ...}` and common wrappers
    let params = body;
    if (body?.tool === 'weatherTool' || body?.tool_id === 'weatherTool') params = body.parameters || body.input;
    if (body?.type === 'call-tool') params = body.input;

    if (!params?.location || !params?.query_type) {
      return resErr(res, 400, 'INVALID_INPUT', 'Missing required fields: location, query_type',
        "Provide 'location' and 'query_type' (e.g., 'current', 'multi_day').");
    }

    const result = await runTool('weatherTool', params, req);
    const output = clean(result);

    // Usage log (safe)
    try {
      logToolUsage?.({ tool: 'weatherTool', input: params, output, req });
    } catch { /* ignore log failures */ }

    return res.json(output);
  } catch (e) {
    console.error('Direct call error:', e);
    const error = toolError(e);
    return res.status(error.code === 'INVALID_INPUT' ? 400 : 503).json({ error });
  }
});

app.post('/tools/weatherPlanningTool', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept raw `{location, context, timeframe}` and common wrappers
    let params = body;
    if (body?.tool === 'weatherPlanningTool' || body?.tool_id === 'weatherPlanningTool') params = body.parameters || body.input;
    if (body?.type === 'call-tool') params = body.input;

    if (!params?.location) {
      return resErr(res, 400, 'INVALID_INPUT', 'Missing required field: location',
        "Provide 'location' (e.g., 'Boca Raton'). Optional: 'context', 'timeframe'.");
    }

    const result = await runTool('weatherPlanningTool', params, req);

    // Unwrap Apps SDK envelope for direct HTTP clients (n8n, curl)
    // Keep structuredContent only; discard content[] wrapper
    const output = clean(result?.structuredContent || result);

    // Usage log (safe)
    try {
      logToolUsage?.({ tool: 'weatherPlanningTool', input: params, output, req });
    } catch { /* ignore log failures */ }

    return res.json(output);
  } catch (e) {
    console.error('Direct planning tool call error:', e);
    const error = toolError(e);
    return res.status(error.code === 'INVALID_INPUT' ? 400 : 503).json({ error });
  }
});
/* ---------- MCP JSON‑RPC Handler (reusable) ---------- */
async function handleMcpRequest(req, res) {
  const body = req.body || {};

  // JSON‑RPC path
  if (body.jsonrpc === '2.0' && body.method) {
    try {
      switch (body.method) {
        case 'initialize':
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2025-03-26',
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'weather-mcp-server', version: manifest.version }
            }
          });

        case 'tools/list':
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: manifest.tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.parameters,
                outputSchema: t.output
              }))
            }
          });

        case 'tools/call': {
          try {
            const toolName = body?.params?.tool || body?.params?.name;
            const args = body?.params?.arguments || {};

            let tool;
            if (toolName === 'weatherTool') {
              tool = weatherTool;
              if (!args?.location || !args?.query_type) {
                return res.json({
                  jsonrpc: '2.0',
                  id: body.id,
                  error: { code: -32602, message: 'Missing required fields: location, query_type' }
                });
              }
            } else if (toolName === 'weatherPlanningTool') {
              tool = weatherPlanningTool;
              if (!args?.location) {
                return res.json({
                  jsonrpc: '2.0',
                  id: body.id,
                  error: { code: -32602, message: 'Missing required field: location' }
                });
              }
            } else {
              return res.json({
                jsonrpc: '2.0',
                id: body.id,
                error: { code: -32601, message: `Tool not found: ${toolName}` }
              });
            }

            const result = await tool.run(args);
            const output = clean(result);
            try { logToolUsage?.({ tool: toolName, input: args, output, req }); } catch {}

            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: { toolUseId: body.id, isFinal: true, output }
            });
          } catch (err) {
            console.error('[MCP tools/call] error:', err);
            try { logToolUsage?.({ tool: body?.params?.tool || body?.params?.name, input: body?.params?.arguments, error: err, req }); } catch {}
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              error: { code: -32603, message: err?.message || 'Internal error' }
            });
          }
        }

        default:
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32601, message: `Method not found: ${body.method}` }
          });
      }
    } catch (e) {
      console.error('[MCP] error:', e);
      return res.json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32603, message: e?.message || 'Internal error' }
      });
    }
  }

  // 🔁 Plain/direct params on ROOT (legacy clients posting to / without JSON‑RPC)
  try {
    // Accept raw `{location, query_type, ...}` and common wrappers
    let params = body;
    if (body?.tool === 'weatherTool' || body?.tool_id === 'weatherTool') params = body.parameters || body.input;
    if (body?.type === 'call-tool') params = body.input;

    if (!params?.location || !params?.query_type) {
      return resErr(res, 400, 'INVALID_INPUT', 'Missing required fields: location, query_type',
        "Provide 'location' and 'query_type' (e.g., 'current', 'multi_day').");
    }

    const result = await weatherTool.run(params);
    const output = clean(result);
    try { logToolUsage?.({ tool: 'weatherTool', input: params, output, req }); } catch {}

    return res.json(output); // ← direct shape for legacy clients
  } catch (e) {
    console.error('Direct-call error:', e);
    return resErr(res, 500, 'INTERNAL_ERROR', e?.message || 'Unexpected server error');
  }
}

/* ---------- MCP Streamable HTTP ---------- */
function createMcpServer() {
  const server = new Server(
    { name: 'weathertrax', version: manifest.version },
    { capabilities: { tools: { listChanged: false } } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: manifest.tools.map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.parameters,
      outputSchema: tool.output,
      annotations: tool.annotations
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const result = await runTool(request.params.name, request.params.arguments || {});
      const structuredContent = result?.structuredContent || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent
      };
    } catch (error) {
      const payload = toolError(error);
      return {
        content: [{ type: 'text', text: payload.message }],
        isError: true,
        _meta: { weathertrax: payload }
      };
    }
  });
  return server;
}

const mcpSessions = new Map();
async function handleStreamableMcp(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  let transport = sessionId && mcpSessions.get(sessionId);
  if (!transport && req.method === 'POST' && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableJsonResponse: true,
      onsessioninitialized: id => mcpSessions.set(id, transport)
    });
    transport.onclose = () => { if (transport.sessionId) mcpSessions.delete(transport.sessionId); };
    await createMcpServer().connect(transport);
  }
  if (!transport) {
    return res.status(req.method === 'GET' ? 405 : 400).json({
      jsonrpc: '2.0', id: null,
      error: { code: -32000, message: 'Initialize an MCP session before making this request.' }
    });
  }
  return transport.handleRequest(req, res, req.body);
}

// Preserve the previous direct root route for n8n-style callers. New MCP clients
// use the standards-compliant Streamable HTTP endpoint below.
app.post('/', handleMcpRequest);
app.options('/mcp', (_req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.sendStatus(204);
});
app.all('/mcp', handleStreamableMcp);


/* ---------- Startup ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WeatherTrax MCP server on http://localhost:${PORT}/`);
  console.log(`   • Manifest: /.well-known/mcp/manifest & /.well-known/tool-manifest.json`);
  console.log(`   • Direct tools: POST /tools/weatherTool & POST /tools/weatherPlanningTool`);
  console.log(`   • MCP JSON-RPC: POST / & POST /mcp`);
  console.log(`   • ChatGPT App UI: GET /ui/weathertrax`);
  console.log(`   • Health: /healthz`);
});
