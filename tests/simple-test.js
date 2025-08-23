#!/usr/bin/env node

// Simple test script with proper environment variables
// Tests all functions in sequence

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '../.env' });

const runTest = () => {
  console.log('🚀 Testing Neo4j MCP Server functions...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { 
      ...process.env,
      NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
      NEO4J_DATABASE: process.env.NEO4J_DATABASE,
      NEO4J_URI: process.env.NEO4J_URI,
      NEO4J_USERNAME: process.env.NEO4J_USERNAME
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let messageId = 1;
  let output = '';

  const sendMessage = (name, args) => {
    const message = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: { name, arguments: args }
    };
    console.log(`Sending ${name} test...`);
    mcp.stdin.write(JSON.stringify(message) + '\n');
  };

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.result) {
            console.log(`✅ Test ${response.id} passed:`, response.result.content?.[0]?.text?.substring(0, 100) + '...');
          } else if (response.error) {
            console.log(`❌ Test ${response.id} failed:`, response.error.message);
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

  // Send test sequence
  let aliceId = null;
  let sfId = null;

  setTimeout(() => {
    console.log('\n1. Testing create_memory (Person)...');
    sendMessage('create_memory', {
      label: 'person',
      properties: {
        name: 'Alice',
        occupation: 'Software Engineer',
        created_at: new Date().toISOString()
      }
    });
  }, 1000);

  setTimeout(() => {
    console.log('\n2. Testing create_memory (Place)...');
    sendMessage('create_memory', {
      label: 'place',
      properties: {
        name: 'San Francisco',
        type: 'City',
        created_at: new Date().toISOString()
      }
    });
  }, 2000);

  setTimeout(() => {
    console.log('\n3. Testing search_memories...');
    sendMessage('search_memories', {
      query: 'Alice',
      type: 'Person',
      depth: 1
    });
  }, 3000);

  setTimeout(() => {
    console.log('\n4. Testing search_memories (all)...');
    sendMessage('search_memories', {
      query: '',
      limit: 10
    });
  }, 4000);

  setTimeout(() => {
    console.log('\n5. Testing create_connection...');
    // Note: In a real test, we'd need to get the IDs from previous responses
    // For this simple test, we'll use placeholder IDs
    sendMessage('create_connection', {
      fromMemoryId: 1,
      toMemoryId: 2,
      type: 'LIVES_IN',
      properties: {
        since: '2020',
        created_at: new Date().toISOString()
      }
    });
  }, 5000);

  setTimeout(() => {
    console.log('\n⏰ Test completed, terminating...');
    mcp.kill();
  }, 8000);
};

if (!process.env.NEO4J_PASSWORD) {
  console.log('⚠️  IMPORTANT: Please copy .env.example to .env and set your credentials');
  console.log('⚠️  cp .env.example .env && edit .env');
  process.exit(1);
}

runTest();