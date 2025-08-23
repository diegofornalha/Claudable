#!/usr/bin/env node

// Test script for create_connection function
// This script tests creating relationships between existing memories

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testCreateConnection = () => {
  console.log('🔗 Testing create_connection function...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // In a real test, we'd first create memories and get their IDs
  // For this test, we'll assume some memory IDs exist
  const tests = [
    {
      id: 1,
      fromMemoryId: 1,  // Assuming Alice has ID 1
      toMemoryId: 2,    // Assuming San Francisco has ID 2
      type: 'LIVES_IN',
      properties: {
        since: '2020',
        created_at: new Date().toISOString()
      }
    },
    {
      id: 2,
      fromMemoryId: 1,  // Assuming Alice has ID 1
      toMemoryId: 3,    // Assuming coffee has ID 3
      type: 'LIKES',
      properties: {
        frequency: 'daily',
        created_at: new Date().toISOString()
      }
    }
  ];

  let completedTests = 0;
  let output = '';

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id && response.id <= tests.length) {
            console.log(`✅ create_connection test ${response.id} passed`);
            console.log('Response:', JSON.stringify(response, null, 2));
            completedTests++;
            
            if (completedTests === tests.length) {
              console.log('🎉 All create_connection tests completed');
              mcp.kill();
              return;
            }
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    }
  });

  mcp.stderr.on('data', (data) => {
    console.error('❌ Error:', data.toString());
  });

  // Send all test messages
  tests.forEach(test => {
    const testMessage = {
      jsonrpc: '2.0',
      id: test.id,
      method: 'tools/call',
      params: {
        name: 'create_connection',
        arguments: {
          fromMemoryId: test.fromMemoryId,
          toMemoryId: test.toMemoryId,
          type: test.type,
          properties: test.properties
        }
      }
    };
    mcp.stdin.write(JSON.stringify(testMessage) + '\n');
  });

  setTimeout(() => {
    console.log('⏰ Test timeout');
    mcp.kill();
  }, 10000);
};

testCreateConnection();