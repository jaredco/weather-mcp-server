# 🌦 WeatherTrax MCP Server

Run instantly:

```bash
npx @jaredco/weather-mcp-server
```

Fast, reliable weather data for **Claude and other MCP clients**.  
Get current conditions and multi-day forecasts for any location worldwide.

🌐 **Remote MCP Server (no install required)**  
https://mcp-weathertrax.jaredco.com

---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io/)
[![Tests Passing](https://img.shields.io/badge/tests-67%2F67%20passing-brightgreen)]()
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

## Claude Desktop

Add this to your Claude Desktop configuration:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "weathertrax": {
      "url": "https://mcp-weathertrax.jaredco.com"
    }
  }
}
```

Restart Claude Desktop.

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

Run locally:

```bash
npm install
npm start
```

Quick tests:

```bash
npm test
```

Full test suite:

```bash
npm run test:full
```

Current results:

```
67 / 67 tests passing
```

---

# 🔒 Privacy

Privacy policy available at:

https://mcp-weathertrax.jaredco.com/privacy

Key points:

- Request metadata logged for abuse prevention
- No persistent storage of weather queries
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