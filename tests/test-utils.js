#!/usr/bin/env node

// Common test utilities

export function setupTestTimeout(mcp, testName, timeoutMs = 10000) {
  const timeout = setTimeout(() => {
    console.error(`❌ ${testName} failed: Timeout reached after ${timeoutMs}ms`);
    mcp.kill();
    process.exit(1);
  }, timeoutMs);
  
  return timeout;
}

export function testSuccess(mcp, timeout, testName) {
  console.log(`\n✨ ${testName} completed successfully!`);
  clearTimeout(timeout);
  mcp.kill();
  process.exit(0);
}

export function testError(mcp, timeout, error, testName) {
  console.error(`❌ ${testName} failed:`, error);
  clearTimeout(timeout);
  mcp.kill();
  process.exit(1);
}