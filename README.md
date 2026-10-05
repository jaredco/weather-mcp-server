# 🌦 WeatherTrax MCP Server

Fast, reliable weather data for **Claude and other MCP clients**.  
Get current conditions and multi-day forecasts for any location worldwide.

🌐 **Remote MCP Server (no install required)**  
`https://mcp-weathertrax.jaredco.com/mcp`

---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io/)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-Registered-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=jaredco)

---

# ⚡ 10-Second Demo

Ask Claude:

> **“What’s the weather in Miami tomorrow?”**

Claude will call the MCP weather server and return a forecast instantly.

Example API call:

```bash
curl -X POST https://mcp-weathertrax.jaredco.com/tools/weatherTool \
  -H "Content-Type: application/json" \
  -d '{"location":"Miami","query_type":"current"}'
```

---

# 🚀 Features

- **Real-time Weather Data** – Current conditions, temperature, humidity, wind speed
- **Multi-day Forecasts** – Up to 14-day forecasts
- **Planning Tool** – 7-day forecasts optimized for events or construction
- **Flexible Locations** – City names, ZIP codes, or coordinates
- **Token-Efficient** – Compact responses optimized for LLM usage
- **Production-Ready** – Rate limiting and monitoring
- **Public API** – No API keys required
- **MCP Compliant** – Full JSON-RPC 2.0 support

---

# ⚡ Quick Start

## Claude

In Claude or Claude Desktop, open **Settings → Connectors → Add connector** and use:

```
Name: WeatherTrax
URL:  https://mcp-weathertrax.jaredco.com/mcp
```

You can now ask:

```
What’s the weather in New York this weekend?
```

---

# 🌐 Direct API Usage

### Health Check

```bash
curl https://mcp-weathertrax.jaredco.com/healthz
```

### MCP Manifest

```bash
curl https://mcp-weathertrax.jaredco.com/.well-known/mcp/manifest
```

---

# 💡 Usage Examples

## Current Weather

```bash
curl -X POST https://mcp-weathertrax.jaredco.com/tools/weatherTool \
  -H "Content-Type: application/json" \
  -d '{
    "location": "San Francisco, CA",
    "query_type": "current"
  }'
```

Example response:

```json
{
  "summary": "It is currently 54°F and Clear in San Francisco.",
  "temp_high": 54,
  "temp_low": 54,
  "condition": "Clear",
  "wind": "5 mph W",
  "humidity": 65
}
```

---

## Multi-Day Forecast

```bash
curl -X POST https://mcp-weathertrax.jaredco.com/tools/weatherTool \
  -H "Content-Type: application/json" \
  -d '{
    "location": "New York",
    "query_type": "multi_day",
    "num_days": 3
  }'
```

---

# 🛠 Available Tools

### weatherTool

Retrieve current weather or forecasts.

Input:

```json
{
  "location": "city name or coordinates",
  "query_type": "current | multi_day",
  "num_days": "optional forecast length"
}
```

---

### weatherPlanningTool

7-day planning forecast for outdoor work or events.

Input:

```json
{
  "location": "city or place",
  "context": "construction | travel | event",
  "timeframe": "optional timeframe hint"
}
```

---

# 🔗 MCP Protocol Integration

This server supports the full MCP JSON-RPC protocol.

Example tool call:

```bash
curl -X POST https://mcp-weathertrax.jaredco.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"weatherTool",
      "arguments":{
        "location":"London",
        "query_type":"current"
      }
    }
  }'
```

---

# 🧪 Testing

Run locally in one terminal:

```bash
npm install
npm start
```

In another terminal, run the protocol tests:

```bash
npm test
```

Release smoke suite:

```bash
npm run test:full
```

`npm run test:full` currently runs the same supported end-to-end smoke suite. The old pre-Streamable-HTTP regression harness remains available as `npm run test:legacy`; it is retained for reference and is not a release gate.

## Deployment configuration

Set these server-side environment variables; never commit them:

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEATHER_API_KEY` | Yes | World Weather Online API key. |
| `PORT` | No | HTTP listener port; defaults to `3000`. |
| `TRUST_PROXY` | Production-dependent | Number of trusted reverse-proxy hops; set to `1` for a single known proxy. |
| `ALLOWED_ORIGINS` | No | Comma-separated browser origins allowed to call MCP; defaults to `https://claude.ai`. |

The service exposes aggregate, non-identifying operational counters at `/metrics`. Do not place this endpoint behind a public dashboard without adding appropriate access control.

---

# 🔒 Privacy

Privacy policy available at:

https://mcp-weathertrax.jaredco.com/privacy

Key points:

- Aggregate operational metrics only; locations and raw provider responses are not logged
- Short-lived in-memory caching reduces duplicate provider requests
- No cookies or tracking
- HTTPS enforced

---

# 🛠 Development

Clone the repo:

```bash
git clone https://github.com/jaredco/weather-mcp-server.git
cd weather-mcp-server
npm install
npm start
```

Server runs locally at:

```
http://localhost:3000
```

---

# 📦 Technology Stack

- Node.js
- Express 5
- @modelcontextprotocol/sdk
- World Weather Online API
- Railway hosting

---

# 📄 License

MIT License.

---

# 🌟 Acknowledgments

Built using the **Model Context Protocol** by Anthropic.

Weather data provided by **World Weather Online**.

---

# 📊 Status

Server: **Production**  
API Version: **1.0.1**  
MCP Protocol: **2025-03-26**

---

Made with ☀️ for Claude and MCP
