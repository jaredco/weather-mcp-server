# WeatherTrax — Claude Connectors Directory submission

## Product details

- **Name:** WeatherTrax
- **Connector URL:** `https://mcp-weathertrax.jaredco.com/mcp`
- **Privacy URL:** `https://mcp-weathertrax.jaredco.com/privacy`
- **Support URL:** `https://github.com/jaredco/weather-mcp-server/issues`
- **Icon URL:** `https://mcp-weathertrax.jaredco.com/logo.svg`
- **Authentication:** none; the connector is a public read-only weather service.

### Short description

Accurate current conditions and weather forecasts for Claude, powered by World Weather Online.

### Long description

Ask Claude weather questions naturally. WeatherTrax provides structured current conditions, one- to fourteen-day forecasts, sunrise and sunset details, rain timing, and a seven-day planning forecast for outdoor activities, trips, and work schedules.

## Implementation audit

| Area | Current implementation |
| --- | --- |
| Runtime | Node.js ESM with Express 5 and `@modelcontextprotocol/sdk` |
| Remote transport | MCP Streamable HTTP at `/mcp`, with JSON responses and managed sessions |
| Tools | `weatherTool` and `weatherPlanningTool` |
| Upstream | World Weather Online Premium API over HTTPS |
| Required environment | `WEATHER_API_KEY` |
| Authentication | No end-user authentication; upstream key remains server-side |
| Caching | In-memory: current/rain 2 min, forecasts 15 min, astronomy 6 hr |
| Instrumentation | Aggregate in-memory request, success/failure, upstream, cache-hit, quota, tool, and query-category counters at `/metrics` |
| Logging | Redacted operational events only; no location, raw arguments, IP address, or provider response |

## Directory-policy evidence

- Both tools are read-only and declare `title`, `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- Tool descriptions state only the implemented capability and are scoped to weather retrieval.
- The service returns structured MCP tool errors for invalid input, provider failure, quota exhaustion, malformed upstream responses, and internal errors.
- `/privacy` explains data handling, metrics, cache retention, and support contact.
- The README provides more than three executable use cases: current conditions, multi-day forecast, planning forecast, and an MCP JSON-RPC call.

## Required pre-submission verification

1. Deploy this revision with `WEATHER_API_KEY` and the correct `TRUST_PROXY` value.
2. Confirm `https://mcp-weathertrax.jaredco.com/mcp` completes initialize, `tools/list`, and each tool call using MCP Inspector or Claude.
3. Verify `/privacy`, `/healthz`, `/logo.svg`, and the support URL publicly resolve.
4. Run one valid query for each tool, one invalid-location query, and one quota-exhaustion simulation or documented provider-error test.
5. Rotate any previously committed keys and remove them from repository history before submitting.
6. Submit the Connectors Directory server review form, agree to the directory terms, and provide verified support contact information.

## Submission checklist

- [ ] Production endpoint deployed and HTTPS certificate valid
- [ ] `WEATHER_API_KEY` configured only in the deployment secret store
- [ ] Any committed secret rotated and purged from Git history
- [ ] MCP Inspector/Claude validation completed against production
- [ ] Privacy, support, and logo URLs verified
- [ ] Three prompt examples copied from README into the review form
- [ ] Verified developer contact supplied to Anthropic
- [ ] Directory policy and terms reviewed immediately before submission
