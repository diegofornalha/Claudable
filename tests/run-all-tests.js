#!/usr/bin/env node

// Master test script that runs all function tests in sequence
// This ensures tests run in the correct order (create data first, then test updates)

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [
  'test-server-startup.js',
  'test-create-memory.js',
  'test-search-memories.js',
  'test-search-arrays.js',
  'test-create-connection.js',
  'test-update-memory.js',
  'test-update-connection.js',
  'test-delete-connection.js',
  'test-delete-memory.js',
  'test-list-memory-labels.js',
  'test-get-guidance.js'
];

let currentTest = 0;

const runNextTest = () => {
  if (currentTest >= tests.length) {
    console.log('\n🎉 All tests completed!');
    return;
  }

  const testFile = tests[currentTest];
  console.log(`\n🚀 Running ${testFile}...`);
  
  const testProcess = spawn('node', [join(__dirname, testFile)], {
    stdio: 'inherit',
    cwd: __dirname // Run tests from the tests directory
  });

  testProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`✅ ${testFile} completed successfully`);
    } else {
      console.log(`❌ ${testFile} failed with code ${code}`);
    }
    
    currentTest++;
    // Add small delay between tests
    setTimeout(runNextTest, 1000);
  });
};

console.log('🧪 Starting Neo4j MCP Server Test Suite');
console.log('Database: test');
console.log('Tests to run:', tests.length);

runNextTest();