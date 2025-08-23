#!/usr/bin/env node

// Test script for create_memory function
// This script tests creating different types of memory entities

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testCreateMemory = () => {
  console.log('🧠 Testing create_memory function...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const tests = [
    {
      id: 1,
      label: 'person',
      properties: {
        name: 'Alice',
        occupation: 'Engineer',
        company: 'Tech Corp',
        context: 'Test user for MCP testing'
      }
    },
    {
      id: 2,
      label: 'place',
      properties: {
        name: 'San Francisco',
        state: 'California',
        country: 'USA',
        context: 'Test location'
      }
    },
    {
      id: 3,
      label: 'food',
      properties: {
        name: 'coffee',
        context: 'Alice loves coffee'
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
            console.log(`✅ create_memory test ${response.id} passed`);
            console.log('Response:', JSON.stringify(response, null, 2));
            completedTests++;
            
            if (completedTests === tests.length) {
              console.log('🎉 All create_memory tests completed');
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
        name: 'create_memory',
        arguments: {
          label: test.label,
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

testCreateMemory();