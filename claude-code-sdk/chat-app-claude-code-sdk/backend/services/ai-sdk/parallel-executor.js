/**
 * AI SDK Parallel Executor Service
 * Executa múltiplos agents simultaneamente com agregação de resultados
 */

const { generateObject, generateText } = require('ai');
const { z } = require('zod');
const { claudeCode } = require('../../providers/ai-sdk-provider');

// Schema para parallel execution plan
const ParallelExecutionPlanSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    agent: z.string(),
    prompt: z.string(),
    priority: z.number().min(1).max(10),
    timeout: z.number().optional(),
    fallbackAgent: z.string().optional(),
    expectedOutputType: z.enum(['text', 'json', 'structured']).optional()
  })),
  aggregationStrategy: z.enum(['merge', 'select_best', 'combine', 'vote', 'custom']),
  maxConcurrency: z.number().min(1).max(10),
  failureStrategy: z.enum(['fail_fast', 'continue', 'retry_failed'])
});

// Schema para result aggregation
const AggregatedResultSchema = z.object({
  finalResult: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.object({
    taskId: z.string(),
    agent: z.string(),
    contribution: z.string(),
    weight: z.number()
  })),
  consensus: z.boolean(),
  dissent: z.array(z.string()).optional()
});

class ParallelExecutor {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.model = claudeCode('opus');
    this.executionStats = new Map();
    this.maxConcurrency = 5;
  }

  /**
   * Planeja execução paralela de tarefas
   */
  async planParallelExecution(request, availableAgents) {
    console.log('[ParallelExecutor] Planning parallel execution...');
    
    try {
      const plan = await generateObject({
        model: this.model,
        schema: ParallelExecutionPlanSchema,
        prompt: `
          Create a parallel execution plan for this request:
          
          Request: "${request}"
          
          Available Agents:
          ${JSON.stringify(availableAgents, null, 2)}
          
          Guidelines:
          1. Decompose into independent parallel tasks
          2. Assign appropriate agents to each task
          3. Set priorities and timeouts
          4. Define aggregation strategy
          5. Plan for failure scenarios
          
          Optimize for speed and quality through parallelization.
        `,
        experimental_telemetry: {
          functionId: 'parallel-plan',
          metadata: { 
            request_length: request.length,
            agent_count: availableAgents.length
          }
        }
      });

      return {
        success: true,
        plan: plan.object,
        metadata: {
          taskCount: plan.object.tasks.length,
          estimatedTime: this._estimateExecutionTime(plan.object)
        }
      };
    } catch (error) {
      console.error('[ParallelExecutor] Planning error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Executa múltiplas tarefas em paralelo
   */
  async executeParallel(tasks, options = {}) {
    console.log(`[ParallelExecutor] Executing ${tasks.length} tasks in parallel...`);
    
    const {
      maxConcurrency = this.maxConcurrency,
      failureStrategy = 'continue',
      io = null,
      sessionId = null
    } = options;

    const results = new Map();
    const errors = [];
    const startTime = Date.now();

    try {
      // Group tasks by priority
      const priorityGroups = this._groupByPriority(tasks);
      
      // Execute each priority group
      for (const [priority, groupTasks] of priorityGroups) {
        console.log(`[ParallelExecutor] Executing priority ${priority} tasks...`);
        
        // Execute tasks in batches respecting maxConcurrency
        const batches = this._createBatches(groupTasks, maxConcurrency);
        
        for (const batch of batches) {
          const batchPromises = batch.map(task => 
            this._executeTask(task, io, sessionId)
              .then(result => ({ taskId: task.id, result, success: true }))
              .catch(error => ({ taskId: task.id, error, success: false }))
          );

          const batchResults = await Promise.allSettled(batchPromises);
          
          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              const { taskId, success, result: taskResult, error } = result.value;
              
              if (success) {
                results.set(taskId, taskResult);
              } else {
                errors.push({ taskId, error });
                
                // Handle failure strategy
                if (failureStrategy === 'fail_fast') {
                  throw new Error(`Task ${taskId} failed: ${error}`);
                } else if (failureStrategy === 'retry_failed') {
                  const retryResult = await this._retryTask(
                    tasks.find(t => t.id === taskId),
                    io,
                    sessionId
                  );
                  if (retryResult.success) {
                    results.set(taskId, retryResult.result);
                  }
                }
              }
            }
          }
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      return {
        success: errors.length === 0,
        results: Object.fromEntries(results),
        errors,
        statistics: {
          totalTasks: tasks.length,
          successfulTasks: results.size,
          failedTasks: errors.length,
          duration,
          averageTaskTime: duration / tasks.length
        }
      };
    } catch (error) {
      console.error('[ParallelExecutor] Execution error:', error);
      return {
        success: false,
        error: error.message,
        results: Object.fromEntries(results),
        errors
      };
    }
  }

  /**
   * Agrega resultados de execução paralela
   */
  async aggregateResults(results, strategy = 'merge', originalRequest = '') {
    console.log(`[ParallelExecutor] Aggregating results with strategy: ${strategy}`);
    
    try {
      let aggregatedResult;
      
      switch (strategy) {
        case 'merge':
          aggregatedResult = await this._mergeResults(results, originalRequest);
          break;
          
        case 'select_best':
          aggregatedResult = await this._selectBestResult(results, originalRequest);
          break;
          
        case 'combine':
          aggregatedResult = await this._combineResults(results, originalRequest);
          break;
          
        case 'vote':
          aggregatedResult = await this._voteOnResults(results, originalRequest);
          break;
          
        default:
          aggregatedResult = await this._customAggregation(results, originalRequest);
      }

      return {
        success: true,
        result: aggregatedResult,
        metadata: {
          strategy,
          sourceCount: Object.keys(results).length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('[ParallelExecutor] Aggregation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Executa map-reduce pattern
   */
  async mapReduce(data, mapFn, reduceFn, options = {}) {
    console.log(`[ParallelExecutor] Starting map-reduce on ${data.length} items...`);
    
    const { batchSize = 10 } = options;
    
    try {
      // Map phase - parallel processing
      const batches = this._createBatches(data, batchSize);
      const mapResults = [];
      
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(item => mapFn(item))
        );
        mapResults.push(...batchResults);
      }
      
      // Reduce phase
      const reducedResult = await reduceFn(mapResults);
      
      return {
        success: true,
        result: reducedResult,
        metadata: {
          inputSize: data.length,
          mapOutputSize: mapResults.length,
          batchCount: batches.length
        }
      };
    } catch (error) {
      console.error('[ParallelExecutor] Map-reduce error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Executa pipeline com stages paralelos
   */
  async executePipeline(stages, input, options = {}) {
    console.log(`[ParallelExecutor] Executing pipeline with ${stages.length} stages...`);
    
    let currentData = input;
    const stageResults = [];
    
    try {
      for (const stage of stages) {
        console.log(`[ParallelExecutor] Stage: ${stage.name}`);
        
        if (stage.parallel) {
          // Execute stage tasks in parallel
          const parallelResults = await this.executeParallel(
            stage.tasks,
            options
          );
          
          if (!parallelResults.success) {
            throw new Error(`Stage ${stage.name} failed`);
          }
          
          currentData = parallelResults.results;
        } else {
          // Sequential stage execution
          currentData = await stage.execute(currentData);
        }
        
        stageResults.push({
          stage: stage.name,
          output: currentData
        });
      }
      
      return {
        success: true,
        finalResult: currentData,
        stageResults,
        metadata: {
          stageCount: stages.length,
          parallelStages: stages.filter(s => s.parallel).length
        }
      };
    } catch (error) {
      console.error('[ParallelExecutor] Pipeline error:', error);
      return {
        success: false,
        error: error.message,
        stageResults
      };
    }
  }

  /**
   * Monitora performance de execução paralela
   */
  getPerformanceMetrics() {
    const metrics = Array.from(this.executionStats.entries()).map(([agent, stats]) => ({
      agent,
      totalExecutions: stats.count,
      averageTime: stats.totalTime / stats.count,
      successRate: stats.successes / stats.count,
      parallelEfficiency: stats.parallelTime / stats.sequentialTime
    }));

    return {
      metrics,
      optimalConcurrency: this._calculateOptimalConcurrency(metrics),
      recommendations: this._generatePerformanceRecommendations(metrics)
    };
  }

  // Private helper methods
  async _executeTask(task, io, sessionId) {
    const agent = this.agentManager.getAgent(task.agent);
    if (!agent) {
      // Try fallback agent if specified
      if (task.fallbackAgent) {
        const fallbackAgent = this.agentManager.getAgent(task.fallbackAgent);
        if (fallbackAgent) {
          return await fallbackAgent.processMessage(task.prompt, sessionId, io);
        }
      }
      throw new Error(`Agent ${task.agent} not found`);
    }

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        agent.processMessage(task.prompt, sessionId, io),
        task.timeout ? this._timeout(task.timeout) : Promise.resolve()
      ].filter(Boolean));

      this._updateExecutionStats(task.agent, {
        time: Date.now() - startTime,
        success: true
      });

      return result;
    } catch (error) {
      this._updateExecutionStats(task.agent, {
        time: Date.now() - startTime,
        success: false
      });
      throw error;
    }
  }

  async _retryTask(task, io, sessionId, maxRetries = 2) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this._executeTask(task, io, sessionId);
        return { success: true, result };
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    
    return { success: false, error: lastError };
  }

  _groupByPriority(tasks) {
    const groups = new Map();
    
    tasks.forEach(task => {
      const priority = task.priority || 5;
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority).push(task);
    });
    
    // Sort by priority (highest first)
    return new Map([...groups.entries()].sort((a, b) => b[0] - a[0]));
  }

  _createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  async _mergeResults(results, originalRequest) {
    const merged = await generateObject({
      model: this.model,
      schema: AggregatedResultSchema,
      prompt: `
        Merge these parallel execution results:
        
        Original Request: "${originalRequest}"
        
        Results:
        ${JSON.stringify(results, null, 2)}
        
        Create a coherent merged response that combines all results.
      `
    });
    
    return merged.object;
  }

  async _selectBestResult(results, originalRequest) {
    // Use evaluator to select best result
    const evaluations = [];
    
    for (const [taskId, result] of Object.entries(results)) {
      const score = await this._scoreResult(result, originalRequest);
      evaluations.push({ taskId, result, score });
    }
    
    evaluations.sort((a, b) => b.score - a.score);
    return evaluations[0].result;
  }

  async _combineResults(results, originalRequest) {
    const combined = await generateText({
      model: this.model,
      prompt: `
        Combine these results into a comprehensive response:
        
        Request: "${originalRequest}"
        
        Results to combine:
        ${JSON.stringify(results, null, 2)}
        
        Synthesize all information into a unified response.
      `,
      maxTokens: 1000
    });
    
    return combined.text;
  }

  async _voteOnResults(results, originalRequest) {
    // Implement voting mechanism
    const votes = new Map();
    
    for (const result of Object.values(results)) {
      const key = JSON.stringify(result).substring(0, 100);
      votes.set(key, (votes.get(key) || 0) + 1);
    }
    
    // Find result with most votes
    let maxVotes = 0;
    let winner = null;
    
    for (const [key, voteCount] of votes) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winner = Object.values(results).find(r => 
          JSON.stringify(r).substring(0, 100) === key
        );
      }
    }
    
    return winner;
  }

  async _customAggregation(results, originalRequest) {
    // Allow for custom aggregation logic
    return {
      results,
      aggregationType: 'custom',
      timestamp: new Date().toISOString()
    };
  }

  async _scoreResult(result, originalRequest) {
    // Simple scoring based on relevance and completeness
    const evaluation = await generateObject({
      model: this.model,
      schema: z.object({ score: z.number().min(0).max(1) }),
      prompt: `Score this result (0-1) based on how well it addresses: "${originalRequest}"\n\nResult: ${JSON.stringify(result)}`
    });
    
    return evaluation.object.score;
  }

  _estimateExecutionTime(plan) {
    const groups = this._groupByPriority(plan.tasks);
    let totalTime = 0;
    
    for (const [_, tasks] of groups) {
      const batches = Math.ceil(tasks.length / plan.maxConcurrency);
      const avgTaskTime = 2000; // Estimate 2s per task
      totalTime += batches * avgTaskTime;
    }
    
    return totalTime;
  }

  _updateExecutionStats(agent, metrics) {
    if (!this.executionStats.has(agent)) {
      this.executionStats.set(agent, {
        count: 0,
        totalTime: 0,
        successes: 0,
        parallelTime: 0,
        sequentialTime: 0
      });
    }
    
    const stats = this.executionStats.get(agent);
    stats.count++;
    stats.totalTime += metrics.time;
    if (metrics.success) stats.successes++;
  }

  _calculateOptimalConcurrency(metrics) {
    // Simple calculation based on success rates and timing
    const avgSuccessRate = metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;
    
    if (avgSuccessRate > 0.9) return 8;
    if (avgSuccessRate > 0.7) return 5;
    return 3;
  }

  _generatePerformanceRecommendations(metrics) {
    const recommendations = [];
    
    metrics.forEach(m => {
      if (m.successRate < 0.7) {
        recommendations.push(`Consider replacing or improving agent ${m.agent}`);
      }
      if (m.parallelEfficiency < 0.5) {
        recommendations.push(`Agent ${m.agent} may not benefit from parallelization`);
      }
    });
    
    return recommendations;
  }

  _timeout(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Task timeout')), ms)
    );
  }
}

module.exports = ParallelExecutor;