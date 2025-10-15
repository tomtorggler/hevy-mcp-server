#!/usr/bin/env node

/**
 * Test script to verify the streamable-http migration
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

async function testHealthEndpoint() {
  console.log('🔍 Testing health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
    return data.transport === 'streamable-http';
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testMCPInitialization() {
  console.log('🔍 Testing MCP initialization...');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const sessionId = response.headers.get('mcp-session-id');
    console.log('✅ MCP initialization successful');
    console.log('📋 Session ID:', sessionId);
    
    return sessionId;
  } catch (error) {
    console.error('❌ MCP initialization failed:', error.message);
    return null;
  }
}

async function testToolsList(sessionId) {
  console.log('🔍 Testing tools list...');
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    console.log('✅ Tools list retrieved successfully');
    
    // Count tools
    const toolsMatch = text.match(/"name":"([^"]+)"/g);
    const toolCount = toolsMatch ? toolsMatch.length : 0;
    console.log(`📋 Found ${toolCount} tools`);
    
    return toolCount > 0;
  } catch (error) {
    console.error('❌ Tools list failed:', error.message);
    return false;
  }
}

async function testLegacySSE() {
  console.log('🔍 Testing legacy SSE endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/sse`);
    console.log('✅ Legacy SSE endpoint still available');
    return true;
  } catch (error) {
    console.error('❌ Legacy SSE endpoint failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting streamable-http migration tests...\n');
  
  const healthOk = await testHealthEndpoint();
  console.log('');
  
  const sessionId = await testMCPInitialization();
  console.log('');
  
  const toolsOk = sessionId ? await testToolsList(sessionId) : false;
  console.log('');
  
  const sseOk = await testLegacySSE();
  console.log('');
  
  // Summary
  console.log('📊 Test Results:');
  console.log(`  Health endpoint: ${healthOk ? '✅' : '❌'}`);
  console.log(`  MCP initialization: ${sessionId ? '✅' : '❌'}`);
  console.log(`  Tools list: ${toolsOk ? '✅' : '❌'}`);
  console.log(`  Legacy SSE: ${sseOk ? '✅' : '❌'}`);
  
  const allPassed = healthOk && sessionId && toolsOk && sseOk;
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`);
  
  process.exit(allPassed ? 0 : 1);
}

runTests().catch(console.error);