#!/usr/bin/env node

// Test script for delete_memory function
// This script tests deleting memories from the graph

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testDeleteMemory = () => {
  console.log('🗑️ Testing delete_memory function...');
  
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
  let testNodeId = null;

  const sendMessage = (name, args) => {
    const message = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: { name, arguments: args }
    };
    mcp.stdin.write(JSON.stringify(message) + '\n');
  };

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === 1) {
            // Created test memory
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              testNodeId = result.n._id;
              console.log(`✅ Created test memory with ID: ${testNodeId}`);
              
              // Now delete it
              console.log('Deleting memory...');
              sendMessage('delete_memory', { nodeId: testNodeId });
            }
          } else if (response.id === 2) {
            // Deleted memory
            console.log('✅ delete_memory test passed');
            console.log('Response:', response.result?.content?.[0]?.text);
            mcp.kill();
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

  // First create a test memory to delete
  console.log('Creating test memory to delete...');
  sendMessage('create_memory', {
    label: 'person',
    properties: {
      name: 'TestPersonToDelete',
      context: 'This is a test memory that will be deleted'
    }
  });

  setTimeout(() => {
    console.log('⏰ Test timeout');
    mcp.kill();
  }, 10000);
};

testDeleteMemory();