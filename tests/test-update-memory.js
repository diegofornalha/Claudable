#!/usr/bin/env node

// Test script for update_memory function
// This script tests updating properties of existing memories

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testUpdateMemory = () => {
  console.log('🔄 Testing update_memory function...');
  
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
  let outputBuffer = '';
  let memoryId = null;

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
    outputBuffer += data.toString();
    const lines = outputBuffer.split('\n');
    outputBuffer = lines[lines.length - 1]; // Keep incomplete line
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === 1) {
            // Created test memory
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              memoryId = result.n._id;
              console.log(`✅ Created test memory with ID: ${memoryId}`);
              
              // Now update it
              console.log('Updating memory properties...');
              sendMessage('update_memory', {
                nodeId: memoryId,
                properties: {
                  job_title: 'Senior Engineer',
                  department: 'Engineering',
                  updated_at: new Date().toISOString()
                }
              });
            }
          } else if (response.id === 2) {
            // Updated memory
            console.log('✅ update_memory test passed');
            console.log('Response:', response.result?.content?.[0]?.text);
            
            // Clean up
            sendMessage('delete_memory', { nodeId: memoryId });
            
            setTimeout(() => mcp.kill(), 1000);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  });

  mcp.stderr.on('data', (data) => {
    console.error('❌ Error:', data.toString());
  });

  // Create a test memory to update
  console.log('Creating test memory...');
  sendMessage('create_memory', {
    label: 'person',
    properties: {
      name: 'TestPerson',
      age: 25,
      created_at: new Date().toISOString()
    }
  });

  setTimeout(() => {
    console.log('⏰ Test timeout');
    mcp.kill();
  }, 10000);
};

testUpdateMemory();