#!/usr/bin/env node

// Test script for date filtering in search_memories function
// This script tests the new since_date parameter

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testDateFiltering = () => {
  console.log('📅 Testing date filtering in search_memories...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let testIndex = 0;
  let output = '';

  const tests = [
    // Test 1: Create memories with different dates
    {
      id: 1,
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_memory',
          arguments: {
            label: 'event',
            properties: {
              name: 'Old Event',
              description: 'This happened long ago',
              created_at: '2023-01-01T00:00:00Z'
            }
          }
        }
      }
    },
    {
      id: 2,
      request: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_memory',
          arguments: {
            label: 'event',
            properties: {
              name: 'Recent Event',
              description: 'This happened recently',
              created_at: new Date().toISOString()
            }
          }
        }
      }
    },
    {
      id: 3,
      request: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'create_memory',
          arguments: {
            label: 'event',
            properties: {
              name: 'Last Week Event',
              description: 'This happened last week',
              created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            }
          }
        }
      }
    },
    // Test 2: Search without date filter (should get all)
    {
      id: 4,
      request: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: '',
            label: 'event',
            order_by: 'created_at DESC'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} total events`);
        return memories.length >= 3;
      }
    },
    // Test 3: Search with date filter (last 30 days)
    {
      id: 5,
      request: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: '',
            label: 'event',
            since_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            order_by: 'created_at DESC'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} events from last 30 days`);
        // Should exclude the 2023 event
        const hasOldEvent = memories.some(m => m.memory.name === 'Old Event');
        if (hasOldEvent) {
          console.error('  ✗ Old event should not be included!');
          return false;
        }
        return memories.length >= 2 && !hasOldEvent;
      }
    },
    // Test 4: Search with date filter (last 3 days)
    {
      id: 6,
      request: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: '',
            label: 'event',
            since_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            order_by: 'created_at DESC'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} events from last 3 days`);
        // Should only include today's event
        const hasRecentEvent = memories.some(m => m.memory.name === 'Recent Event');
        const hasLastWeekEvent = memories.some(m => m.memory.name === 'Last Week Event');
        if (hasLastWeekEvent) {
          console.error('  ✗ Last week event should not be included!');
          return false;
        }
        return memories.length === 1 && hasRecentEvent && !hasLastWeekEvent;
      }
    },
    // Test 5: Search with query and date filter
    {
      id: 7,
      request: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: 'happened',
            since_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} memories containing "happened" from last 30 days`);
        return memories.length >= 2;
      }
    },
    // Cleanup: Delete test memories
    {
      id: 8,
      cleanup: true,
      searchAndDelete: ['Old Event', 'Recent Event', 'Last Week Event']
    }
  ];

  const runNextTest = () => {
    if (testIndex >= tests.length) {
      console.log('\n✅ All date filtering tests completed successfully!');
      mcp.kill();
      process.exit(0);
    }

    const test = tests[testIndex];
    
    if (test.cleanup) {
      // Cleanup phase
      console.log('\n🧹 Cleaning up test data...');
      let cleanupIndex = 0;
      
      const cleanupNext = () => {
        if (cleanupIndex >= test.searchAndDelete.length) {
          testIndex++;
          runNextTest();
          return;
        }
        
        const name = test.searchAndDelete[cleanupIndex];
        const searchRequest = {
          jsonrpc: '2.0',
          id: 100 + cleanupIndex,
          method: 'tools/call',
          params: {
            name: 'search_memories',
            arguments: { query: name }
          }
        };
        
        mcp.stdin.write(JSON.stringify(searchRequest) + '\n');
        
        const handleSearchResponse = (data) => {
          const response = JSON.parse(data);
          if (response.id === 100 + cleanupIndex) {
            const memories = JSON.parse(response.result.content[0].text);
            if (memories.length > 0) {
              const deleteRequest = {
                jsonrpc: '2.0',
                id: 200 + cleanupIndex,
                method: 'tools/call',
                params: {
                  name: 'delete_memory',
                  arguments: { nodeId: memories[0].memory._id }
                }
              };
              mcp.stdin.write(JSON.stringify(deleteRequest) + '\n');
            } else {
              cleanupIndex++;
              cleanupNext();
            }
          } else if (response.id === 200 + cleanupIndex) {
            console.log(`  ✓ Deleted ${test.searchAndDelete[cleanupIndex]}`);
            cleanupIndex++;
            cleanupNext();
          }
        };
        
        mcp.stdout.once('data', handleSearchResponse);
      };
      
      cleanupNext();
      return;
    }
    
    console.log(`\nTest ${test.id}:`);
    mcp.stdin.write(JSON.stringify(test.request) + '\n');
  };

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    
    // Try to parse complete JSON objects
    const lines = output.split('\n');
    output = lines[lines.length - 1]; // Keep incomplete line
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === tests[testIndex].id) {
            if (response.error) {
              console.error(`  ✗ Error: ${response.error.message}`);
              process.exit(1);
            }
            
            if (tests[testIndex].validate) {
              if (tests[testIndex].validate(response.result)) {
                testIndex++;
                runNextTest();
              } else {
                console.error('  ✗ Validation failed');
                process.exit(1);
              }
            } else {
              console.log(`  ✓ Memory created`);
              testIndex++;
              runNextTest();
            }
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    }
  });

  mcp.stderr.on('data', (data) => {
    const message = data.toString();
    if (!message.includes('MCP server running')) {
      console.error('Error:', message);
    }
  });

  mcp.on('close', (code) => {
    if (code !== 0) {
      console.error(`\n❌ MCP process exited with code ${code}`);
      process.exit(1);
    }
  });

  // Start tests after server is ready
  setTimeout(runNextTest, 2000);
};

testDateFiltering();