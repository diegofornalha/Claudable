#!/usr/bin/env node

// Test script for list_memory_labels function
// This script tests listing all unique memory labels in the knowledge graph

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testListMemoryLabels = () => {
  console.log('📋 Testing list_memory_labels function...');
  
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
            console.log('✅ Created first test memory (person)');
          } else if (response.id === 2) {
            console.log('✅ Created second test memory (place)');
          } else if (response.id === 3) {
            console.log('✅ Created third test memory (person)');
          } else if (response.id === 4) {
            console.log('✅ Created fourth test memory (project)');
          } else if (response.id === 5) {
            // List memory types result
            console.log('✅ list_memory_labels test passed');
            const content = response.result?.content?.[0]?.text;
            if (content) {
              const result = JSON.parse(content);
              console.log('\nMemory Labels Found:');
              if (result.length > 0 && result[0].labels) {
                result[0].labels.forEach(item => {
                  const count = item.count;
                console.log(`- ${item.label}: ${count} memories`);
                });
                console.log(`\nTotal memories: ${result[0].totalMemories}`);
                console.log('\n✨ Test completed successfully!');
                clearTimeout(timeout);
                mcp.kill();
                process.exit(0);
              }
            }
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

  // Create some test memories with different types
  console.log('Creating test memories with different types...');
  
  sendMessage('create_memory', {
    label: 'person',
    properties: {
      name: 'Alice Test',
      created_at: new Date().toISOString()
    }
  });

  setTimeout(() => {
    sendMessage('create_memory', {
      label: 'place',
      properties: {
        name: 'Test City',
        created_at: new Date().toISOString()
      }
    });
  }, 500);

  setTimeout(() => {
    sendMessage('create_memory', {
      label: 'person',
      properties: {
        name: 'Bob Test',
        created_at: new Date().toISOString()
      }
    });
  }, 1000);

  setTimeout(() => {
    sendMessage('create_memory', {
      label: 'project',
      properties: {
        name: 'Test Project',
        created_at: new Date().toISOString()
      }
    });
  }, 1500);

  // Now list all memory types
  setTimeout(() => {
    console.log('\nListing all memory labels...');
    sendMessage('list_memory_labels', {});
  }, 2000);

  // Set a timeout but mark test as failed if we reach it
  const timeout = setTimeout(() => {
    console.error('❌ Test failed: Timeout reached');
    mcp.kill();
    process.exit(1);
  }, 10000);
};

testListMemoryLabels();