#!/usr/bin/env node
// test-suite.js
// Comprehensive test suite for WeatherTrax MCP Server
// Tests legacy endpoints, MCP protocol, origin validation, and new features

import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Test utilities
function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(`  ${title}`, 'bold');
  console.log('='.repeat(70));
}

function logTest(name) {
  log(`\n📋 Test: ${name}`, 'cyan');
}

async function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    log(`  ✅ PASS: ${message}`, 'green');
  } else {
    failedTests++;
    log(`  ❌ FAIL: ${message}`, 'red');
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function assertDeepEqual(actual, expected, message) {
  totalTests++;
  const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  if (isEqual) {
    passedTests++;
    log(`  ✅ PASS: ${message}`, 'green');
  } else {
    failedTests++;
    log(`  ❌ FAIL: ${message}`, 'red');
    log(`    Expected: ${JSON.stringify(expected)}`, 'yellow');
    log(`    Actual: ${JSON.stringify(actual)}`, 'yellow');
    throw new Error(`Deep equal assertion failed: ${message}`);
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

// -----------------------------------------------------------------------------
// 1. LEGACY COMPATIBILITY TESTS (n8n Integration)
// -----------------------------------------------------------------------------
async function testLegacyEndpoints() {
  logSection('1. LEGACY COMPATIBILITY TESTS (n8n Integration)');

  // Test 1.1: Direct POST /tools/weatherTool - Current Weather
  logTest('1.1: Direct POST /tools/weatherTool (current weather)');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/1.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.summary !== undefined, 'Response contains summary');
    await assert(data.temp_high !== undefined, 'Response contains temp_high');
    log(`    Response: ${data.summary}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 1.2: Direct POST /tools/weatherTool - Multi-day Forecast
  logTest('1.2: Direct POST /tools/weatherTool (multi-day forecast)');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/1.0'
      },
      body: JSON.stringify({
        location: 'New York',
        query_type: 'multi_day',
        num_days: 3
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.summary !== undefined, 'Response contains summary');
    await assert(Array.isArray(data.forecast), 'Response contains forecast array');
    await assert(data.forecast.length === 3, 'Forecast has 3 days');
    log(`    Forecast days: ${data.forecast.length}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 1.3: Direct POST /tools/weatherPlanningTool
  logTest('1.3: Direct POST /tools/weatherPlanningTool');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherPlanningTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/1.0'
      },
      body: JSON.stringify({
        location: 'Boca Raton',
        context: 'outdoor event planning',
        timeframe: 'this week'
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.summary !== undefined, 'Response contains summary');
    await assert(data.location !== undefined, 'Response contains location');
    log(`    Location: ${data.location}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 1.4: Legacy JSON-RPC on POST / (backward compatibility)
  logTest('1.4: Legacy JSON-RPC on POST / (direct tool call)');
  try {
    const response = await fetch(`${BASE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n-legacy/1.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.summary !== undefined, 'Legacy endpoint still works');
    log(`    Legacy endpoint functional`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// -----------------------------------------------------------------------------
// 2. MCP JSON-RPC PROTOCOL TESTS (Claude Integration)
// -----------------------------------------------------------------------------
async function testMcpProtocol() {
  logSection('2. MCP JSON-RPC PROTOCOL TESTS (Claude Integration)');

  // Test 2.1: MCP Initialize Handshake
  logTest('2.1: MCP initialize handshake');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.jsonrpc === '2.0', 'Response has jsonrpc 2.0');
    await assert(data.result !== undefined, 'Response contains result');
    await assert(data.result.protocolVersion === '2025-03-26', 'Protocol version is 2025-03-26');
    await assert(data.result.serverInfo?.name === 'weather-mcp-server', 'Server name is correct');
    log(`    Protocol: ${data.result.protocolVersion}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 2.2: MCP tools/list Discovery
  logTest('2.2: MCP tools/list discovery');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.result?.tools !== undefined, 'Response contains tools array');
    await assert(data.result.tools.length === 2, 'Server advertises 2 tools');

    const toolNames = data.result.tools.map(t => t.name);
    await assert(toolNames.includes('weatherTool'), 'weatherTool is listed');
    await assert(toolNames.includes('weatherPlanningTool'), 'weatherPlanningTool is listed');
    log(`    Tools found: ${toolNames.join(', ')}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 2.3: MCP tools/call - weatherTool
  logTest('2.3: MCP tools/call - weatherTool');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'weatherTool',
          arguments: {
            location: 'San Francisco',
            query_type: 'current'
          }
        }
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.result?.output !== undefined, 'Response contains output');
    await assert(data.result.output.summary !== undefined, 'Output contains weather summary');
    log(`    ${data.result.output.summary}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 2.4: MCP tools/call - weatherPlanningTool
  logTest('2.4: MCP tools/call - weatherPlanningTool');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'weatherPlanningTool',
          arguments: {
            location: 'Seattle',
            context: 'construction project',
            timeframe: 'next week'
          }
        }
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.result?.output !== undefined, 'Response contains output');
    await assert(data.result.output.summary !== undefined, 'Output contains planning summary');
    log(`    Planning tool works correctly`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 2.5: MCP on legacy / endpoint (dual mount)
  logTest('2.5: MCP JSON-RPC on legacy / endpoint');
  try {
    const response = await fetch(`${BASE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list'
      })
    });
    const data = await response.json();
    await assert(response.status === 200, 'Response status is 200');
    await assert(data.result?.tools?.length === 2, 'Legacy / endpoint supports MCP');
    log(`    Dual mount working (/ and /mcp)`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// -----------------------------------------------------------------------------
// 3. ORIGIN VALIDATION TESTS
// -----------------------------------------------------------------------------
async function testOriginValidation() {
  logSection('3. ORIGIN VALIDATION TESTS');

  // Test 3.1: n8n User-Agent Accepted
  logTest('3.1: n8n user-agent accepted');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/2.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    await assert(response.status === 200, 'n8n user-agent is accepted');
    log(`    n8n traffic allowed`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 3.2: Claude Desktop User-Agent Accepted
  logTest('3.2: Claude Desktop user-agent accepted');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.5.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      })
    });
    await assert(response.status === 200, 'Claude Desktop user-agent is accepted');
    log(`    Claude Desktop traffic allowed`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 3.3: X-Bypass-Origin Header Escape Hatch
  logTest('3.3: X-Bypass-Origin header escape hatch');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Origin': 'true',
        'User-Agent': 'CustomClient/1.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    await assert(response.status === 200, 'X-Bypass-Origin header works');
    log(`    Bypass header escape hatch functional`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 3.4: Generic HTTP Client (curl) Accepted
  logTest('3.4: Generic HTTP client (curl) accepted');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'curl/7.88.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    await assert(response.status === 200, 'curl user-agent is accepted');
    log(`    Curl/generic HTTP clients allowed`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 3.5: GET Requests Never Validated
  logTest('3.5: GET requests bypass origin validation');
  try {
    const response = await fetch(`${BASE_URL}/.well-known/mcp/manifest`, {
      method: 'GET',
      headers: {
        'User-Agent': 'UnknownBot/1.0'
      }
    });
    await assert(response.status === 200, 'GET requests bypass validation');
    log(`    GET requests not subject to origin validation`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 3.6: Unrecognized Origin Still Allowed (Generous Mode)
  logTest('3.6: Unrecognized origin still allowed (generous mode)');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CompletelyUnknownClient/99.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    await assert(response.status === 200, 'Unrecognized origins still allowed in generous mode');
    log(`    Generous mode: unrecognized traffic allowed (logged)`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// -----------------------------------------------------------------------------
// 4. NEW FEATURES TESTS
// -----------------------------------------------------------------------------
async function testNewFeatures() {
  logSection('4. NEW FEATURES TESTS (Connectors Directory Requirements)');

  // Test 4.1: GET /privacy Endpoint
  logTest('4.1: GET /privacy endpoint');
  try {
    const response = await fetch(`${BASE_URL}/privacy`);
    const text = await response.text();
    await assert(response.status === 200, 'Response status is 200');
    await assert(response.headers.get('content-type').includes('text/plain'), 'Content-Type is text/plain');
    await assert(text.includes('WeatherTrax MCP Server'), 'Privacy policy contains server name');
    await assert(text.includes('Privacy Policy'), 'Privacy policy contains title');
    await assert(text.length > 100, 'Privacy policy has substantial content');
    log(`    Privacy policy length: ${text.length} bytes`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 4.2: Manifest Privacy URL Updated
  logTest('4.2: Manifest privacy_policy_url updated');
  try {
    const response = await fetch(`${BASE_URL}/.well-known/mcp/manifest`);
    const data = await response.json();
    await assert(response.status === 200, 'Manifest endpoint accessible');
    await assert(
      data.legal?.privacy_policy_url === 'https://mcp-weathertrax.jaredco.com/privacy',
      'Privacy URL points to /privacy endpoint'
    );
    log(`    Privacy URL: ${data.legal.privacy_policy_url}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 4.3: Manifest Integrity Check
  logTest('4.3: Manifest integrity check');
  try {
    const response = await fetch(`${BASE_URL}/.well-known/mcp/manifest`);
    const data = await response.json();
    await assert(data.name === 'weathertrax', 'Manifest name is correct');
    await assert(data.version === '1.0.0', 'Manifest version is correct');
    await assert(data.tools?.length === 2, 'Manifest lists 2 tools');
    await assert(data.homepage_url !== undefined, 'Manifest has homepage URL');
    await assert(data.contact?.support_url !== undefined, 'Manifest has support URL');
    log(`    Manifest complete and valid`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 4.4: Legacy Tool Manifest Still Works
  logTest('4.4: Legacy /.well-known/tool-manifest.json still works');
  try {
    const response = await fetch(`${BASE_URL}/.well-known/tool-manifest.json`);
    const data = await response.json();
    await assert(response.status === 200, 'Legacy manifest endpoint works');
    await assert(data.name === 'weathertrax', 'Legacy manifest has same content');
    log(`    Backward compatibility maintained`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// -----------------------------------------------------------------------------
// 5. ERROR HANDLING TESTS
// -----------------------------------------------------------------------------
async function testErrorHandling() {
  logSection('5. ERROR HANDLING TESTS');

  // Test 5.1: Missing Required Field (location)
  logTest('5.1: Missing required field (location)');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/1.0'
      },
      body: JSON.stringify({
        query_type: 'current'
      })
    });
    const data = await response.json();
    await assert(response.status === 400, 'Returns 400 for missing location');
    await assert(data.error !== undefined, 'Response contains error object');
    log(`    Error message: ${data.error.message}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 5.2: Unknown Tool Name (MCP)
  logTest('5.2: Unknown tool name in MCP call');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'nonexistentTool',
          arguments: {}
        }
      })
    });
    const data = await response.json();
    await assert(data.error !== undefined, 'Returns error for unknown tool');
    await assert(data.error.code === -32601, 'Error code is -32601 (not found)');
    log(`    Error handled correctly`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 5.3: Invalid JSON-RPC Method
  logTest('5.3: Invalid JSON-RPC method');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'invalid/method'
      })
    });
    const data = await response.json();
    await assert(data.error !== undefined, 'Returns error for invalid method');
    await assert(data.error.code === -32601, 'Error code is -32601');
    log(`    Invalid method rejected correctly`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// -----------------------------------------------------------------------------
// 6. HEALTH & MONITORING TESTS
// -----------------------------------------------------------------------------
async function testHealthMonitoring() {
  logSection('6. HEALTH & MONITORING TESTS');

  // Test 6.1: Health Check Endpoint
  logTest('6.1: GET /healthz endpoint');
  try {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();
    await assert(response.status === 200, 'Health check returns 200');
    await assert(data.status === 'ok', 'Status is ok');
    await assert(data.version === '1.0.0', 'Version is correct');
    await assert(data.upstream === 'ok', 'Upstream is ok');
    log(`    Health: ${data.status}, Version: ${data.version}`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 6.2: CORS Headers Present
  logTest('6.2: CORS headers present');
  try {
    const response = await fetch(`${BASE_URL}/healthz`, {
      method: 'OPTIONS'
    });
    await assert(response.status === 204, 'OPTIONS returns 204');
    await assert(
      response.headers.get('access-control-allow-origin') === '*',
      'CORS headers present'
    );
    log(`    CORS configured correctly`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }

  // Test 6.3: Cache Control Headers
  logTest('6.3: Cache control headers');
  try {
    const response = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n/1.0'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    await assert(
      response.headers.get('cache-control') === 'no-store',
      'Cache-Control is no-store'
    );
    await assert(
      response.headers.get('x-server-version') === '1.0.0',
      'X-Server-Version header present'
    );
    log(`    Cache control and version headers correct`, 'blue');
  } catch (error) {
    log(`    Error: ${error.message}`, 'red');
  }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================
async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════════════╗', 'bold');
  log('║     WEATHERTRAX MCP SERVER - COMPREHENSIVE TEST SUITE             ║', 'bold');
  log('╚════════════════════════════════════════════════════════════════════╝', 'bold');
  log(`\nTarget: ${BASE_URL}`, 'cyan');
  log(`Started: ${new Date().toISOString()}\n`, 'cyan');

  const startTime = Date.now();

  try {
    // Run all test suites
    await testLegacyEndpoints();
    await testMcpProtocol();
    await testOriginValidation();
    await testNewFeatures();
    await testErrorHandling();
    await testHealthMonitoring();

    // Final report
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logSection('TEST SUMMARY');
    log(`\n  Total Tests:  ${totalTests}`, 'bold');
    log(`  ✅ Passed:     ${passedTests}`, 'green');
    log(`  ❌ Failed:     ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`  Duration:     ${duration}s`, 'cyan');

    if (failedTests === 0) {
      log('\n🎉 ALL TESTS PASSED! Server is ready for production deployment.', 'green');
      log('✅ Safe to deploy to Railway and submit to Anthropic Connectors Directory\n', 'green');
      process.exit(0);
    } else {
      log('\n⚠️  SOME TESTS FAILED - Review failures before deployment\n', 'red');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ TEST SUITE ERROR: ${error.message}`, 'red');
    log(`Stack: ${error.stack}`, 'yellow');
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };
