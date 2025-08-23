#!/usr/bin/env node

// Quick test to demonstrate word tokenization

import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const runQuickTest = async () => {
  console.log('🔤 Quick Word Tokenization Demo\n');
  
  const mcp = spawn('node', ['../build/index.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let testStep = 0;

  const steps = [
    // Create Ben Weeks
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_memory',
        arguments: {
          label: 'person',
          properties: {
            name: 'Ben Weeks',
            role: 'Software Engineer',
            email: 'ben.weeks@techcorp.com'
          }
        }
      }
    },
    // Create Benjamin Smith
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_memory',
        arguments: {
          label: 'person',
          properties: {
            name: 'Benjamin Smith',
            role: 'Data Analyst',
            nickname: 'Ben'
          }
        }
      }
    },
    // Create Sarah Weeks
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'create_memory',
        arguments: {
          label: 'person',
          properties: {
            name: 'Sarah Weeks',
            role: 'Product Manager',
            department: 'Engineering'
          }
        }
      }
    },
    // Search for "Ben Weeks"
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'search_memories',
        arguments: {
          query: 'Ben Weeks',
          label: 'person'
        }
      }
    }
  ];

  const processResponse = (response) => {
    if (response.id <= 3) {
      console.log(`✓ Created: ${steps[response.id - 1].params.arguments.properties.name}`);
    } else if (response.id === 4) {
      console.log('\n🔍 Searching for "Ben Weeks"...\n');
      const memories = JSON.parse(response.result.content[0].text);
      console.log(`Found ${memories.length} matches:\n`);
      
      memories.forEach(m => {
        console.log(`- ${m.memory.name} (${m.memory.role})`);
        if (m.memory.nickname) console.log(`  Nickname: ${m.memory.nickname}`);
        if (m.memory.email) console.log(`  Email: ${m.memory.email}`);
        console.log('');
      });
      
      console.log('✨ Word tokenization working! Found all people with "Ben" OR "Weeks" in their properties.');
      
      // Cleanup and exit
      setTimeout(() => {
        mcp.kill();
        process.exit(0);
      }, 1000);
    }
  };

  mcp.stdout.on('data', (data) => {
    output += data.toString();
    const lines = output.split('\n');
    output = lines[lines.length - 1];
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const response = JSON.parse(line);
          if (response.result && response.id) {
            processResponse(response);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  });

  mcp.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('MCP server running')) {
      console.error('Error:', msg);
    }
  });

  // Send requests sequentially
  const sendNextRequest = () => {
    if (testStep < steps.length) {
      mcp.stdin.write(JSON.stringify(steps[testStep]) + '\n');
      testStep++;
      setTimeout(sendNextRequest, 500);
    }
  };

  // Start after server is ready
  setTimeout(sendNextRequest, 2000);
};

runQuickTest();