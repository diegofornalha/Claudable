#!/usr/bin/env node

// Test script for update_connection function
// This script tests updating properties of existing connections

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testUpdateConnection = () => {
  console.log('🔗🔄 Testing update_connection function...');
  
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
  let memory1Id = null;
  let memory2Id = null;

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
            // Created first memory
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              memory1Id = result.n._id;
              console.log(`✅ Created first memory with ID: ${memory1Id}`);
            }
          } else if (response.id === 2) {
            // Created second memory
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              memory2Id = result.n._id;
              console.log(`✅ Created second memory with ID: ${memory2Id}`);
              
              // Create connection
              console.log('Creating connection...');
              sendMessage('create_connection', {
                fromMemoryId: memory1Id,
                toMemoryId: memory2Id,
                type: 'WORKS_AT',
                properties: {
                  role: 'Engineer',
                  since: '2020',
                  created_at: new Date().toISOString()
                }
              });
            }
          } else if (response.id === 3) {
            // Created connection
            console.log('✅ Created connection');
            
            // Now update it
            console.log('Updating connection properties...');
            sendMessage('update_connection', {
              fromMemoryId: memory1Id,
              toMemoryId: memory2Id,
              type: 'WORKS_AT',
              properties: {
                role: 'Senior Engineer',
                since: '2020',
                promoted: '2024',
                updated_at: new Date().toISOString()
              }
            });
          } else if (response.id === 4) {
            // Updated connection
            console.log('✅ update_connection test passed');
            console.log('Response:', response.result?.content?.[0]?.text);
            
            // Clean up
            sendMessage('delete_memory', { nodeId: memory1Id });
            sendMessage('delete_memory', { nodeId: memory2Id });
            
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

  // Create test data
  console.log('Creating test memories...');
  sendMessage('create_memory', {
    label: 'person',
    properties: {
      name: 'TestEmployee',
      created_at: new Date().toISOString()
    }
  });
  
  setTimeout(() => {
    sendMessage('create_memory', {
      label: 'organization',
      properties: {
        name: 'TestCompany',
        created_at: new Date().toISOString()
      }
    });
  }, 500);

  setTimeout(() => {
    console.log('⏰ Test timeout');
    mcp.kill();
  }, 10000);
};

testUpdateConnection();