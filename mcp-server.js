// mcp-server.js
// ESM required: ensure "type": "module" in package.json

import express from 'express';
import { weatherTool } from './tools/weatherTool.js';
import { logToolUsage } from './utils/logger.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

/* ---------- CORS (broad for demos; tighten if needed) ---------- */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // allowlist in prod
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
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
  legal: { privacy_policy_url: 'https://github.com/jaredco-ai/weathertrax-mcp-agent-demo/blob/main/PRIVACY.md' },
  contact: { support_url: 'https://github.com/jaredco-ai/weathertrax-mcp-agent-demo/issues' },
  transport: { http: { streaming: true } },
  tools: [
    {
      name: 'weatherTool',
      title: 'WeatherTrax',
      description: 'Current weather, forecasts (1–14 days), sunrise/sunset, and rain timing.',
      parameters: weatherTool.inputSchema, // keep schemas in one place
      output: weatherTool.outputSchema,
      annotations: { readOnlyHint: true, category: 'Information', displayName: 'WeatherTrax (Current & Forecast)' }
    }
  ]
};

/* ---------- Basic landing ---------- */
app.get('/', (_req, res) => {
  res.redirect('https://github.com/jaredco-ai/weathertrax-mcp-agent-demo');
});

/* ---------- Healthcheck ---------- */
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    version: manifest.version,
    upstream: 'ok'
  });
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

/* ---------- MCP JSON‑RPC over HTTP (Streamable HTTP compatible) ---------- */
app.post('/', async (req, res) => {
  const body = req.body || {};
  // If it doesn’t look like JSON‑RPC, delegate to direct tool calling for convenience
  if (body.jsonrpc !== '2.0' || !body.method) {
    // Back‑compat: treat as a direct call
    req.url = '/tools/weatherTool';
    return app._router.handle(req, res, () => {});
  }

  try {
    switch (body.method) {
      case 'initialize': {
        return res.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'weather-mcp-server', version: manifest.version }
          }
        });
      }

      case 'tools/list': {
        return res.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: manifest.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
            outputSchema: t.output
          })) }
        });
      }

      case 'tools/call': {
        try {
          const toolName = body?.params?.tool || body?.params?.name;
          const args = body?.params?.arguments || {};
          if (toolName !== 'weatherTool') {
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              error: { code: -32601, message: `Tool not found: ${toolName}` }
            });
          }
          if (!args?.location || !args?.query_type) {
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              error: { code: -32602, message: 'Missing required fields: location, query_type' }
            });
          }

          const result = await weatherTool.run(args);
          const output = clean(result);

          try {
            logToolUsage?.({ tool: 'weatherTool', input: args, output, req });
          } catch { /* ignore log failures */ }

          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            result: { toolUseId: body.id, isFinal: true, output }
          });
        } catch (err) {
          console.error('[MCP tools/call] error:', err);
          try {
            logToolUsage?.({ tool: 'weatherTool', input: body?.params?.arguments, error: err, req });
          } catch {}
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32603, message: err?.message || 'Internal error' }
          });
        }
      }

      default: {
        return res.json({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: `Method not found: ${body.method}` }
        });
      }
    }
  } catch (e) {
    console.error('[MCP root] error:', e);
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32603, message: e?.message || 'Internal error' }
    });
  }
});

/* ---------- Startup ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WeatherTrax MCP server on http://localhost:${PORT}/`);
  console.log(`   • Manifest: /.well-known/mcp/manifest & /.well-known/tool-manifest.json`);
  console.log(`   • Direct tool: POST /tools/weatherTool`);
  console.log(`   • MCP JSON-RPC: POST /`);
  console.log(`   • Health: /healthz`);
});