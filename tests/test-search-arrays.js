#!/usr/bin/env node

// Test script for search_memories with array properties
// This script tests that search works correctly when memories have array properties

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testSearchArrays = () => {
  console.log('🔍 Testing search_memories with array properties...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { 
      ...process.env,
      NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
      NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'mcp-test',
      NEO4J_URI: process.env.NEO4J_URI,
      NEO4J_USERNAME: process.env.NEO4J_USERNAME
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let memoryId = null;
  let testPhase = 'create';
  let searchCount = 0;

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id && response.result) {
            if (response.id === 1) {
              // Create memory response
              const content = response.result?.content?.[0]?.text;
              const memory = JSON.parse(content);
              memoryId = memory.memory._id;
              console.log('✅ Created memory with array properties, ID:', memoryId);
              console.log('   Skills:', memory.memory.skills);
              console.log('   Interests:', memory.memory.interests);
              console.log('   Tags:', memory.memory.tags);
              // Now search for it
              testPhase = 'search';
              searchCount = 0;
              setTimeout(() => {
                console.log('\nSearching for "Python" (in skills array)...');
                sendSearchMessage('Python');
              }, 500);
            } else if (testPhase === 'search' && searchCount < 4) {
              // Search responses
              const content = response.result?.content?.[0]?.text;
              const results = JSON.parse(content);
              
              if (results.length > 0 && results[0].memory._id === memoryId) {
                searchCount++;
                
                if (searchCount === 1) {
                  console.log('✅ Search found memory with array property!');
                  console.log('   Found skills:', results[0].memory.skills);
                  
                  // Test searching for another skill
                  setTimeout(() => {
                    console.log('\nSearching for "Neo4j" (in skills array)...');
                    sendSearchMessage('Neo4j');
                  }, 500);
                } else if (searchCount === 2) {
                  console.log('✅ Second search also found memory!');
                  
                  // Test searching in interests array
                  setTimeout(() => {
                    console.log('\nSearching for "hiking" (in interests array)...');
                    sendSearchMessage('hiking');
                  }, 500);
                } else if (searchCount === 3) {
                  console.log('✅ Third search found memory via interests!');
                  
                  // Test searching in tags array
                  setTimeout(() => {
                    console.log('\nSearching for "backend" (in tags array)...');
                    sendSearchMessage('backend');
                  }, 500);
                } else if (searchCount === 4) {
                  console.log('✅ Fourth search found memory via tags!');
                  
                  // Clean up
                  testPhase = 'cleanup';
                  setTimeout(() => {
                    console.log('\nCleaning up test memory...');
                    sendDeleteMessage();
                  }, 500);
                }
              } else {
                console.error(`❌ Search ${searchCount + 1} failed to find memory with array property`);
                mcp.kill();
                process.exit(1);
              }
            } else if (testPhase === 'cleanup') {
              // Delete response
              console.log('✅ Test memory deleted');
              console.log('\n✨ All array search tests completed successfully!');
              mcp.kill();
              process.exit(0);
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

  const sendCreateMessage = () => {
    const message = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_memory',
        arguments: {
          label: 'person',
          properties: {
            name: 'Test Developer',
            skills: ['Python', 'FastAPI', 'Docker', 'Neo4j', 'MCP'],
            interests: ['hiking', 'photography', 'machine learning'],
            tags: ['developer', 'backend', 'ai-enthusiast'],
            experience_years: 5
          }
        }
      }
    };
    mcp.stdin.write(JSON.stringify(message) + '\n');
  };

  const sendSearchMessage = (query) => {
    const message = {
      jsonrpc: '2.0',
      id: searchCount + 2, // 2, 3, 4, 5
      method: 'tools/call',
      params: {
        name: 'search_memories',
        arguments: {
          query: query,
          depth: 0
        }
      }
    };
    mcp.stdin.write(JSON.stringify(message) + '\n');
  };

  const sendDeleteMessage = () => {
    const message = {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'delete_memory',
        arguments: {
          nodeId: memoryId
        }
      }
    };
    mcp.stdin.write(JSON.stringify(message) + '\n');
  };

  // Create a memory with array properties
  console.log('Creating memory with array properties...');
  sendCreateMessage();

  // Set timeout
  setTimeout(() => {
    console.error('❌ Test timeout');
    mcp.kill();
    process.exit(1);
  }, 15000);
};

testSearchArrays();