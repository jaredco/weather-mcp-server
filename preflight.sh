#!/usr/bin/env bash
set -euo pipefail

BASE="https://mcp-weathertrax.jaredco.com"

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

jqcheck() {
  local data="$1" expr="$2" msg="$3"
  echo "$data" | jq -e "$expr" >/dev/null || fail "$msg"
}

# 1) Manifest (Claude path)
MANIFEST=$(curl -fsS "$BASE/.well-known/mcp/manifest")
jqcheck "$MANIFEST" '.name=="weathertrax"' "Manifest .name != weathertrax"
jqcheck "$MANIFEST" '.tools|length>0 and .tools[0].name=="weatherTool"' "Manifest tools missing or wrong"
pass "Manifest (Claude) OK"

# 2) Manifest (legacy path serves same JSON)
LEGACY=$(curl -fsS "$BASE/.well-known/tool-manifest.json")
diff <(echo "$MANIFEST" | jq -S .) <(echo "$LEGACY" | jq -S .) >/dev/null || fail "Legacy manifest differs from Claude manifest"
pass "Manifest (legacy) matches"

# 3) Healthcheck
HEALTH=$(curl -fsS "$BASE/healthz")
jqcheck "$HEALTH" '.status=="ok"' "Health status not ok"
jqcheck "$HEALTH" '.version?!=null' "Health missing version"
pass "Healthcheck OK"

# 4) JSON-RPC initialize
INIT=$(curl -fsS -X POST "$BASE/" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"init-1","method":"initialize","params":{}}')
jqcheck "$INIT" '.result.serverInfo.name=="weather-mcp-server"' "JSON-RPC initialize failed"
pass "JSON-RPC initialize OK"

# 5) JSON-RPC tools/list
LIST=$(curl -fsS -X POST "$BASE/" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"list-1","method":"tools/list","params":{}}')
jqcheck "$LIST" '.result.tools|length>0 and .result.tools[0].name=="weatherTool"' "JSON-RPC tools/list failed"
pass "JSON-RPC tools/list OK"

# 6) JSON-RPC tools/call (current)
CALL_CURR=$(curl -fsS -X POST "$BASE/" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"call-1","method":"tools/call","params":{"tool":"weatherTool","arguments":{"location":"Miami, FL","query_type":"current"}}}')
jqcheck "$CALL_CURR" '.result.output|type=="object"' "tools/call (current) missing result.output"
pass "JSON-RPC tools/call (current) OK"

# 7) JSON-RPC tools/call (3-day forecast)
CALL_FC=$(curl -fsS -X POST "$BASE/" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"call-2","method":"tools/call","params":{"tool":"weatherTool","arguments":{"location":"40.7128,-74.0060","query_type":"multi_day","num_days":3}}}')
jqcheck "$CALL_FC" '.result.output.forecast|type=="array" and (.result.output.forecast|length)>=1' "tools/call (forecast) missing forecast array"
pass "JSON-RPC tools/call (forecast) OK"

# 8) Direct tool (n8n/simple clients)
DIRECT=$(curl -fsS -X POST "$BASE/tools/weatherTool" -H 'Content-Type: application/json' -d '{"location":"40.7128,-74.0060","query_type":"multi_day","num_days":3}')
jqcheck "$DIRECT" '.forecast|type=="array" and (.forecast|length)>=1' "Direct tool missing forecast array"
pass "Direct tool call OK"

# 9) Error handling (structured)
ERR=$(curl -s -w "\n%{http_code}\n" -X POST "$BASE/tools/weatherTool" -H 'Content-Type: application/json' -d '{"location":"Nowhere"}')
ERR_BODY=$(echo "$ERR" | sed -n '1,/^[0-9][0-9][0-9]$/p' | sed '$d')
ERR_CODE=$(echo "$ERR" | tail -n1)
jqcheck "$ERR_BODY" '.error.code?!=null' "Error body missing structured error"
[[ "$ERR_CODE" = "400" || "$ERR_CODE" = "422" ]] || fail "Expected 4xx on invalid input, got HTTP $ERR_CODE"
pass "Structured error JSON OK"

echo "🎉 ALL CHECKS PASSED"