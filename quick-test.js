#!/usr/bin/env node
// quick-test.js - Simplified test runner with guaranteed output
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  WEATHERTRAX MCP SERVER - QUICK TEST SUITE                 ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`📋 ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('Starting tests...\n');

  // Test 1: Health Check
  await test('Health Check', async () => {
    const res = await fetch(`${BASE_URL}/healthz`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Health check failed');
  });

  // Test 2: Privacy Endpoint
  await test('Privacy Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/privacy`);
    const text = await res.text();
    if (!text.includes('WeatherTrax')) throw new Error('Privacy policy missing');
    if (res.headers.get('content-type') !== 'text/plain; charset=utf-8') {
      throw new Error('Wrong content type');
    }
  });

  // Test 3: Manifest Privacy URL
  await test('Manifest Privacy URL', async () => {
    const res = await fetch(`${BASE_URL}/.well-known/mcp/manifest`);
    const data = await res.json();
    if (data.legal?.privacy_policy_url !== 'https://mcp-weathertrax.jaredco.com/privacy') {
      throw new Error('Privacy URL not updated');
    }
  });

  // Test 4: MCP Initialize
  await test('MCP Initialize', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude Desktop/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      })
    });
    const data = await res.json();
    if (data.result?.serverInfo?.name !== 'weather-mcp-server') {
      throw new Error('MCP initialize failed');
    }
  });

  // Test 5: MCP Tools List
  await test('MCP Tools List', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });
    const data = await res.json();
    if (data.result?.tools?.length !== 2) {
      throw new Error(`Expected 2 tools, got ${data.result?.tools?.length}`);
    }
  });

  // Test 6: n8n Tool Call
  await test('n8n Tool Call', async () => {
    const res = await fetch(`${BASE_URL}/tools/weatherTool`, {
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
    const data = await res.json();
    if (!data.summary) throw new Error('No weather summary returned');
  });

  // Test 7: Bypass Header
  await test('X-Bypass-Origin Header', async () => {
    const res = await fetch(`${BASE_URL}/tools/weatherTool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Origin': 'true'
      },
      body: JSON.stringify({
        location: 'Miami',
        query_type: 'current'
      })
    });
    if (res.status !== 200) throw new Error('Bypass header failed');
  });

  // Test 8: Legacy Endpoint
  await test('Legacy POST / Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/`, {
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
    const data = await res.json();
    if (!data.summary) throw new Error('Legacy endpoint failed');
  });

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`\n  Total Tests:  ${passed + failed}`);
  console.log(`  ✅ Passed:     ${passed}`);
  console.log(`  ❌ Failed:     ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ Server is ready for deployment\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  SOME TESTS FAILED\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n❌ TEST SUITE ERROR:', error.message);
  process.exit(1);
});
