#!/usr/bin/env node

// Test script for word tokenization in search_memories
// This script tests that multi-word queries find memories containing ANY of the words

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const testWordTokenization = () => {
  console.log('🔤 Testing word tokenization in search_memories...');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let testIndex = 0;
  let output = '';

  const tests = [
    // Test 1-3: Create test memories
    {
      id: 1,
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_memory',
          arguments: {
            label: 'person',
            properties: {
              name: 'Ben Weeks',
              occupation: 'Software Engineer',
              company: 'TechCorp'
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
            label: 'person',
            properties: {
              name: 'Sarah Ben',
              occupation: 'Data Scientist',
              company: 'DataCo'
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
            label: 'person',
            properties: {
              name: 'John Weeks',
              occupation: 'Project Manager',
              department: 'Engineering'
            }
          }
        }
      }
    },
    {
      id: 4,
      request: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'create_memory',
          arguments: {
            label: 'person',
            properties: {
              name: 'Alice Johnson',
              occupation: 'Designer',
              skills: ['UI', 'UX', 'Figma']
            }
          }
        }
      }
    },
    // Test 4: Search for "Ben Weeks" - should find all three people
    {
      id: 5,
      request: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: 'Ben Weeks',
            label: 'person'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} people matching "Ben Weeks"`);
        
        const names = memories.map(m => m.memory.name).sort();
        console.log(`    Names found: ${names.join(', ')}`);
        
        // Should find: Ben Weeks, Sarah Ben, John Weeks
        const hasBenWeeks = names.includes('Ben Weeks');
        const hasSarahBen = names.includes('Sarah Ben');
        const hasJohnWeeks = names.includes('John Weeks');
        const hasAlice = names.includes('Alice Johnson');
        
        if (!hasBenWeeks || !hasSarahBen || !hasJohnWeeks) {
          console.error('  ✗ Missing expected results');
          return false;
        }
        if (hasAlice) {
          console.error('  ✗ Found unexpected result: Alice Johnson');
          return false;
        }
        
        return memories.length === 3;
      }
    },
    // Test 5: Search for single word "Engineer"
    {
      id: 6,
      request: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: 'Engineer',
            label: 'person'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} people matching "Engineer"`);
        
        const names = memories.map(m => m.memory.name);
        // Should find Ben Weeks (Software Engineer) and John Weeks (Engineering department)
        const hasBenWeeks = names.includes('Ben Weeks');
        const hasJohnWeeks = names.includes('John Weeks');
        
        if (!hasBenWeeks || !hasJohnWeeks) {
          console.error('  ✗ Missing expected results');
          return false;
        }
        
        return memories.length >= 2;
      }
    },
    // Test 6: Search for "Software Data" - should find both engineers
    {
      id: 7,
      request: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: 'Software Data'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} memories matching "Software Data"`);
        
        const names = memories.map(m => m.memory.name);
        // Should find Ben Weeks (Software) and Sarah Ben (Data)
        const hasBenWeeks = names.includes('Ben Weeks');
        const hasSarahBen = names.includes('Sarah Ben');
        
        return hasBenWeeks && hasSarahBen;
      }
    },
    // Test 7: Search in array properties
    {
      id: 8,
      request: {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'search_memories',
          arguments: {
            query: 'UI Figma'
          }
        }
      },
      validate: (response) => {
        const memories = JSON.parse(response.content[0].text);
        console.log(`  ✓ Found ${memories.length} memories matching "UI Figma"`);
        
        // Should find Alice Johnson who has both UI and Figma in skills
        const hasAlice = memories.some(m => m.memory.name === 'Alice Johnson');
        return hasAlice && memories.length >= 1;
      }
    },
    // Cleanup: Delete test memories
    {
      id: 9,
      cleanup: true,
      searchAndDelete: ['Ben Weeks', 'Sarah Ben', 'John Weeks', 'Alice Johnson']
    }
  ];

  const runNextTest = () => {
    if (testIndex >= tests.length) {
      console.log('\n✅ All word tokenization tests completed successfully!');
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

testWordTokenization();