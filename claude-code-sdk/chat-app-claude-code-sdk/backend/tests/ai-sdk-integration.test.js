/**
 * AI SDK Integration Tests
 * Tests for Orchestrator, Evaluator, Parallel Executor, and AgentManagerV2
 */

const AgentManagerV2 = require('../services/AgentManagerV2');
const ClaudeAgentSDK = require('../agents/ClaudeAgentSDK');
const CrewAIAgentSDK = require('../agents/CrewAIAgentSDK');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  verbose: true
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  if (TEST_CONFIG.verbose) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Test Suite
class AISDKIntegrationTests {
  constructor() {
    this.manager = null;
    this.testResults = [];
  }

  async setup() {
    log('\n🚀 Setting up AI SDK Integration Tests...', 'cyan');
    
    try {
      // Initialize AgentManagerV2
      this.manager = new AgentManagerV2();
      
      // Register test agents
      const claudeAgent = new ClaudeAgentSDK();
      await claudeAgent.initialize({ model: 'sonnet-3.5' });
      this.manager.registerAgent('claude-sdk', claudeAgent);
      
      const crewAgent = new CrewAIAgentSDK();
      await crewAgent.initialize({ model: 'sonnet-3.5' });
      this.manager.registerAgent('crew-sdk', crewAgent);
      
      log('✅ Setup complete', 'green');
      return true;
    } catch (error) {
      log(`❌ Setup failed: ${error.message}`, 'red');
      return false;
    }
  }

  // Test 1: Orchestrator Routing
  async testOrchestratorRouting() {
    log('\n📋 Test 1: Orchestrator Routing', 'blue');
    
    const testCases = [
      {
        message: 'Write a Python function to calculate fibonacci',
        expectedAgent: 'claude',
        expectedWorkflow: 'simple'
      },
      {
        message: 'Research the latest trends in AI and create a comprehensive report',
        expectedAgent: 'crewai',
        expectedWorkflow: 'orchestrated'
      },
      {
        message: 'Analyze this code and suggest improvements step by step',
        expectedAgent: 'claude',
        expectedWorkflow: 'evaluator'
      }
    ];

    const results = [];
    
    for (const testCase of testCases) {
      try {
        const routing = await this.manager.orchestrator.route(testCase.message);
        
        const passed = routing.success && 
                      routing.decision.agent && 
                      routing.decision.confidence > 0;
        
        results.push({
          test: 'routing',
          input: testCase.message.substring(0, 50),
          expected: testCase.expectedAgent,
          actual: routing.decision?.agent,
          workflow: routing.decision?.suggestedWorkflow,
          confidence: routing.decision?.confidence,
          passed
        });
        
        if (passed) {
          log(`  ✅ Routed to ${routing.decision.agent} (confidence: ${routing.decision.confidence})`, 'green');
        } else {
          log(`  ❌ Routing failed`, 'red');
        }
      } catch (error) {
        results.push({
          test: 'routing',
          input: testCase.message.substring(0, 50),
          error: error.message,
          passed: false
        });
        log(`  ❌ Error: ${error.message}`, 'red');
      }
    }
    
    return results;
  }

  // Test 2: Quality Evaluation
  async testQualityEvaluation() {
    log('\n📋 Test 2: Quality Evaluation', 'blue');
    
    const testResponses = [
      {
        response: 'The answer is 42.',
        request: 'What is the meaning of life?',
        expectedScore: { min: 3, max: 7 }
      },
      {
        response: 'To calculate the Fibonacci sequence, you can use dynamic programming. Here\'s a Python implementation:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    dp = [0] * (n + 1)\n    dp[1] = 1\n    for i in range(2, n + 1):\n        dp[i] = dp[i-1] + dp[i-2]\n    return dp[n]\n```\n\nThis solution has O(n) time complexity and O(n) space complexity.',
        request: 'Write a Python function to calculate fibonacci',
        expectedScore: { min: 7, max: 10 }
      }
    ];

    const results = [];
    
    for (const test of testResponses) {
      try {
        const evaluation = await this.manager.evaluator.evaluateResponse(
          test.response,
          test.request
        );
        
        const score = evaluation.evaluation?.score || 0;
        const passed = evaluation.success && 
                      score >= test.expectedScore.min && 
                      score <= test.expectedScore.max;
        
        results.push({
          test: 'evaluation',
          request: test.request.substring(0, 50),
          score,
          expectedRange: `${test.expectedScore.min}-${test.expectedScore.max}`,
          passed
        });
        
        if (passed) {
          log(`  ✅ Quality score: ${score}/10`, 'green');
        } else {
          log(`  ❌ Score ${score} outside expected range`, 'red');
        }
      } catch (error) {
        results.push({
          test: 'evaluation',
          request: test.request.substring(0, 50),
          error: error.message,
          passed: false
        });
        log(`  ❌ Error: ${error.message}`, 'red');
      }
    }
    
    return results;
  }

  // Test 3: Parallel Execution
  async testParallelExecution() {
    log('\n📋 Test 3: Parallel Execution', 'blue');
    
    const tasks = [
      {
        id: 'task1',
        agent: 'claude-sdk',
        prompt: 'What is 2+2?',
        priority: 5
      },
      {
        id: 'task2',
        agent: 'claude-sdk',
        prompt: 'What is the capital of France?',
        priority: 5
      },
      {
        id: 'task3',
        agent: 'claude-sdk',
        prompt: 'Name three primary colors',
        priority: 5
      }
    ];

    try {
      const startTime = Date.now();
      
      const result = await this.manager.parallelExecutor.executeParallel(
        tasks,
        { maxConcurrency: 3 }
      );
      
      const duration = Date.now() - startTime;
      
      const passed = result.success && 
                    Object.keys(result.results).length === tasks.length;
      
      const testResult = {
        test: 'parallel_execution',
        tasksRequested: tasks.length,
        tasksCompleted: Object.keys(result.results).length,
        duration,
        passed
      };
      
      if (passed) {
        log(`  ✅ Executed ${tasks.length} tasks in ${duration}ms`, 'green');
        log(`  📊 Average time per task: ${Math.round(duration / tasks.length)}ms`, 'cyan');
      } else {
        log(`  ❌ Only completed ${Object.keys(result.results).length}/${tasks.length} tasks`, 'red');
      }
      
      return [testResult];
    } catch (error) {
      log(`  ❌ Error: ${error.message}`, 'red');
      return [{
        test: 'parallel_execution',
        error: error.message,
        passed: false
      }];
    }
  }

  // Test 4: Orchestrated Processing
  async testOrchestratedProcessing() {
    log('\n📋 Test 4: Orchestrated Processing', 'blue');
    
    const testMessage = 'Create a simple todo list application in JavaScript';
    
    try {
      const result = await this.manager.processMessage(
        testMessage,
        'test-session-' + Date.now(),
        null, // No socket.io for testing
        { enableOrchestration: true }
      );
      
      const passed = result && result.content && result.metadata;
      
      const testResult = {
        test: 'orchestrated_processing',
        input: testMessage,
        hasContent: !!result?.content,
        hasMetadata: !!result?.metadata,
        agent: result?.metadata?.agent,
        passed
      };
      
      if (passed) {
        log(`  ✅ Processed with ${result.metadata.agent}`, 'green');
        if (result.metadata.multiStep) {
          log(`  📊 Multi-step processing: ${result.metadata.stepsCompleted} steps`, 'cyan');
        }
      } else {
        log(`  ❌ Processing failed`, 'red');
      }
      
      return [testResult];
    } catch (error) {
      log(`  ❌ Error: ${error.message}`, 'red');
      return [{
        test: 'orchestrated_processing',
        error: error.message,
        passed: false
      }];
    }
  }

  // Test 5: Performance Metrics
  async testPerformanceMetrics() {
    log('\n📋 Test 5: Performance Metrics', 'blue');
    
    try {
      const report = await this.manager.getPerformanceReport();
      
      const passed = report && 
                    report.overview && 
                    report.orchestration && 
                    report.quality;
      
      const testResult = {
        test: 'performance_metrics',
        hasOverview: !!report?.overview,
        hasOrchestration: !!report?.orchestration,
        hasQuality: !!report?.quality,
        hasParallel: !!report?.parallel,
        totalRequests: report?.overview?.totalRequests || 0,
        passed
      };
      
      if (passed) {
        log(`  ✅ Metrics collected successfully`, 'green');
        log(`  📊 Total requests: ${report.overview.totalRequests}`, 'cyan');
        log(`  📊 Success rate: ${(report.overview.successRate * 100).toFixed(1)}%`, 'cyan');
      } else {
        log(`  ❌ Metrics collection incomplete`, 'red');
      }
      
      return [testResult];
    } catch (error) {
      log(`  ❌ Error: ${error.message}`, 'red');
      return [{
        test: 'performance_metrics',
        error: error.message,
        passed: false
      }];
    }
  }

  // Run all tests
  async runAll() {
    log('\n' + '='.repeat(60), 'cyan');
    log('🧪 Running AI SDK Integration Tests', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const setupSuccess = await this.setup();
    if (!setupSuccess) {
      log('\n❌ Setup failed, cannot run tests', 'red');
      return;
    }
    
    const allResults = [];
    
    // Run each test suite
    allResults.push(...await this.testOrchestratorRouting());
    allResults.push(...await this.testQualityEvaluation());
    allResults.push(...await this.testParallelExecution());
    allResults.push(...await this.testOrchestratedProcessing());
    allResults.push(...await this.testPerformanceMetrics());
    
    // Generate summary
    this.generateSummary(allResults);
  }

  generateSummary(results) {
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 Test Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;
    
    log(`\n  Total Tests: ${total}`, 'blue');
    log(`  ✅ Passed: ${passed}`, 'green');
    log(`  ❌ Failed: ${failed}`, 'red');
    log(`  📊 Success Rate: ${((passed / total) * 100).toFixed(1)}%`, 'cyan');
    
    if (failed > 0) {
      log('\n  Failed Tests:', 'red');
      results.filter(r => !r.passed).forEach(r => {
        log(`    - ${r.test}: ${r.error || 'Did not meet expectations'}`, 'red');
      });
    }
    
    // Performance insights
    const parallelTest = results.find(r => r.test === 'parallel_execution');
    if (parallelTest && parallelTest.passed) {
      log('\n  Performance Insights:', 'cyan');
      log(`    - Parallel execution time: ${parallelTest.duration}ms`, 'cyan');
      log(`    - Tasks completed: ${parallelTest.tasksCompleted}`, 'cyan');
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    
    // Exit code based on test results
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests if executed directly
if (require.main === module) {
  const tester = new AISDKIntegrationTests();
  tester.runAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = AISDKIntegrationTests;