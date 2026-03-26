// mcp-server.js
// ESM required: ensure "type": "module" in package.json

import express from 'express';
import { weatherTool } from './tools/weatherTool.js';
import { weatherPlanningTool } from './tools/weatherPlanningTool.js';
import { logToolUsage } from './utils/logger.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configure trust proxy BEFORE rate limiting middleware
// Set to false for local development (no proxy)
// For production behind a proxy, use: 1, 'loopback', or specific IP ranges
app.set('trust proxy', false);

import rateLimit from 'express-rate-limit';
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.use(express.json({ limit: '256kb' }));

// prevent caches on API responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Server-Version', '1.0.0');
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

  // Escape hatch for n8n compatibility
  if (req.headers['x-bypass-origin']) {
    console.log('[Origin] ✓ Bypass header present, allowing request to', req.path);
    return next();
  }

  // Check for valid origins
  const origin = req.headers.origin || req.headers.referer || '';
  const userAgent = req.headers['user-agent'] || '';

  // Valid patterns (generous whitelist)
  const validPatterns = [
    /claude\.ai/i,
    /anthropic\.com/i,
    /claude.*desktop/i,
    /mcp-weathertrax\.jaredco\.com/i,
    /n8n/i,        // n8n workflows
    /railway/i,    // Railway health checks
    /postman/i,    // Testing tools
    /insomnia/i,
    /curl/i,
    /http/i        // Generic HTTP clients
  ];

  // Check if request matches any valid pattern
  const isValidOrigin = validPatterns.some(pattern => pattern.test(origin));
  const isValidUA = validPatterns.some(pattern => pattern.test(userAgent));

  // Be generous - if no origin/UA info or if it matches any pattern, allow it
  if (!origin && !userAgent) {
    console.log('[Origin] ⚠️  No origin/UA info, allowing request to', req.path, '(generous mode)');
    return next();
  }

  if (isValidOrigin || isValidUA) {
    console.log('[Origin] ✓ Valid request to', req.path, '| Origin:', origin.substring(0, 50), '| UA:', userAgent.substring(0, 50));
    return next();
  }

  // Log potentially suspicious requests but STILL ALLOW (generous mode)
  console.log('[Origin] ⚠️  Unrecognized but allowing:', req.path, '| Origin:', origin, '| UA:', userAgent.substring(0, 80));
  return next(); // Still allow - err on the side of permissive
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

/* ---------- Unified manifest (reused for Claude + others) ---------- */
const manifest = {
  name: 'weathertrax',
  version: '1.0.0',
  description:
    'Fast current conditions and multi‑day forecasts by city or lat/long. Token‑frugal JSON with clear, structured errors.',
  homepage_url: 'https://github.com/jaredco-ai/weathertrax-mcp-agent-demo',
  legal: { privacy_policy_url: 'https://mcp-weathertrax.jaredco.com/privacy' },
  contact: { support_url: 'https://github.com/jaredco-ai/weathertrax-mcp-agent-demo/issues' },
  transport: { http: { streaming: true } },
  tools: [
    {
      name: 'weatherTool',
      title: 'WeatherTrax',
      description: 'MUST be called to retrieve real-time current weather conditions, forecasts (1–14 days), sunrise/sunset times, and rain timing for any location. Do not answer weather questions from internal knowledge or estimates—always use this tool to fetch live data.',
      parameters: weatherTool.inputSchema, // keep schemas in one place
      output: weatherTool.outputSchema,
      annotations: { readOnlyHint: true, category: 'Information', displayName: 'WeatherTrax (Current & Forecast)', requiresConfirmation: false }
    },
    {
      name: 'weatherPlanningTool',
      title: 'WeatherTrax Planning',
      description: 'MUST be called for all future weather planning queries including construction scheduling, outdoor work, event planning, travel preparation, or risk assessment. Returns authoritative 7-day forecasts. Do not rely on general knowledge—always invoke this tool for planning-related weather questions.',
      parameters: weatherPlanningTool.inputSchema,
      output: weatherPlanningTool.outputSchema,
      annotations: { readOnlyHint: true, category: 'Information', displayName: 'WeatherTrax (Planning)', requiresConfirmation: false }
    }
  ]
};

 
app.get('/', (_req, res) => {
  res.type('html').send(
    `<h1>WeatherTrax MCP</h1>
     <p>JSON‑RPC: POST / & POST /mcp</p>
     <p>Manifest: <a href="/.well-known/mcp/manifest">/.well-known/mcp/manifest</a></p>
     <p>Docs: <a href="https://github.com/jaredco-ai/weathertrax-mcp-agent-demo">GitHub</a></p>`
  );
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
    const privacyPath = join(__dirname, 'weathertrax-mcp-demo', 'PRIVACY.md');
    const privacyContent = await readFile(privacyPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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

    const result = await weatherTool.run(params);
    const output = clean(result);

    // Usage log (safe)
    try {
      logToolUsage?.({ tool: 'weatherTool', input: params, output, req });
    } catch { /* ignore log failures */ }

    return res.json(output);
  } catch (e) {
    console.error('Direct call error:', e);
    return resErr(res, 500, 'INTERNAL_ERROR', e?.message || 'Unexpected server error');
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

    const result = await weatherPlanningTool.run(params);

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
    return resErr(res, 500, 'INTERNAL_ERROR', e?.message || 'Unexpected server error');
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

/* ---------- MCP JSON‑RPC over HTTP (dual mount) ---------- */
// Mount on ROOT for backward compatibility
app.post('/', handleMcpRequest);

// ChatGPT-specific /mcp endpoint handlers
// OPTIONS for CORS preflight (ChatGPT connector creation)
app.options('/mcp', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.sendStatus(204);
});

// GET for health/probe (ChatGPT connector creation)
app.get('/mcp', (_req, res) => {
  res.json({
    status: 'ok',
    mcp: true,
    version: manifest.version
  });
});

// POST for MCP JSON-RPC (actual tool execution)
app.post('/mcp', handleMcpRequest);


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