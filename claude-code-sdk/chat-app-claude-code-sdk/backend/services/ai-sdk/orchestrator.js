/**
 * AI SDK Orchestrator Service
 * Implementa o padrão Orchestrator-Worker para routing inteligente de agentes
 */

const { generateObject, generateText } = require('ai');
const { z } = require('zod');
const { claudeCode } = require('../../providers/ai-sdk-provider');

// Schema para routing decisions
const RoutingDecisionSchema = z.object({
  agent: z.enum(['claude', 'crewai', 'parallel', 'sequential']),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  suggestedWorkflow: z.enum(['simple', 'evaluator', 'parallel', 'orchestrated']),
  parameters: z.object({
    maxSteps: z.number().optional(),
    requiresValidation: z.boolean().optional(),
    parallelAgents: z.array(z.string()).optional(),
    expectedOutputType: z.string().optional()
  }).optional()
});

// Schema para task decomposition
const TaskDecompositionSchema = z.object({
  mainTask: z.string(),
  subtasks: z.array(z.object({
    id: z.string(),
    description: z.string(),
    agent: z.string(),
    dependencies: z.array(z.string()),
    priority: z.number(),
    estimatedDuration: z.number()
  })),
  executionPlan: z.object({
    parallel: z.array(z.array(z.string())),
    sequential: z.array(z.string())
  })
});

class Orchestrator {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.model = claudeCode('opus');
    this.routingHistory = new Map();
    this.performanceMetrics = new Map();
  }

  /**
   * Analisa a mensagem e decide qual agent/workflow usar
   */
  async route(message, context = {}) {
    console.log('[Orchestrator] Analyzing message for routing...');
    
    try {
      const routingContext = this._buildRoutingContext(message, context);
      
      const decision = await generateObject({
        model: this.model,
        schema: RoutingDecisionSchema,
        prompt: `
          Analyze this user message and determine the best agent/workflow:
          
          Message: "${message}"
          
          Available Agents:
          - claude: General purpose, coding, complex reasoning
          - crewai: Multi-agent collaboration, research tasks
          - parallel: Multiple independent tasks
          - sequential: Step-by-step processing
          
          Context:
          ${JSON.stringify(routingContext, null, 2)}
          
          Consider:
          1. Task complexity
          2. Need for validation
          3. Parallelization opportunities
          4. Expected output type
          
          Provide routing decision with reasoning.
        `,
        experimental_telemetry: {
          functionId: 'orchestrator-route',
          metadata: { message_length: message.length }
        }
      });

      // Track routing decision
      this._trackRoutingDecision(message, decision.object);
      
      return {
        success: true,
        decision: decision.object,
        metadata: {
          processingTime: decision.usage?.totalDuration,
          tokens: decision.usage?.totalTokens
        }
      };
    } catch (error) {
      console.error('[Orchestrator] Routing error:', error);
      return {
        success: false,
        error: error.message,
        fallback: 'claude' // Default fallback
      };
    }
  }

  /**
   * Decompõe tarefas complexas em subtarefas
   */
  async decomposeTask(message, context = {}) {
    console.log('[Orchestrator] Decomposing complex task...');
    
    try {
      const decomposition = await generateObject({
        model: this.model,
        schema: TaskDecompositionSchema,
        prompt: `
          Decompose this complex task into manageable subtasks:
          
          Task: "${message}"
          
          Context:
          ${JSON.stringify(context, null, 2)}
          
          Create an execution plan that:
          1. Identifies all necessary subtasks
          2. Determines dependencies
          3. Optimizes for parallel execution where possible
          4. Assigns appropriate agents to each subtask
          
          Provide a detailed decomposition and execution plan.
        `,
        experimental_telemetry: {
          functionId: 'orchestrator-decompose',
          metadata: { task_complexity: 'high' }
        }
      });

      return {
        success: true,
        plan: decomposition.object,
        metadata: {
          subtaskCount: decomposition.object.subtasks.length,
          parallelSteps: decomposition.object.executionPlan.parallel.length
        }
      };
    } catch (error) {
      console.error('[Orchestrator] Decomposition error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Coordena a execução de múltiplos agents
   */
  async orchestrateExecution(plan, io, sessionId) {
    console.log('[Orchestrator] Starting orchestrated execution...');
    
    const results = {
      subtasks: {},
      errors: [],
      startTime: Date.now()
    };

    try {
      // Execute parallel groups
      for (const parallelGroup of plan.executionPlan.parallel) {
        const parallelPromises = parallelGroup.map(taskId => 
          this._executeSubtask(
            plan.subtasks.find(t => t.id === taskId),
            results,
            io,
            sessionId
          )
        );
        
        const groupResults = await Promise.allSettled(parallelPromises);
        
        groupResults.forEach((result, index) => {
          const taskId = parallelGroup[index];
          if (result.status === 'fulfilled') {
            results.subtasks[taskId] = result.value;
          } else {
            results.errors.push({
              taskId,
              error: result.reason
            });
          }
        });
      }

      // Execute sequential tasks
      for (const taskId of plan.executionPlan.sequential) {
        const subtask = plan.subtasks.find(t => t.id === taskId);
        try {
          results.subtasks[taskId] = await this._executeSubtask(
            subtask,
            results,
            io,
            sessionId
          );
        } catch (error) {
          results.errors.push({ taskId, error: error.message });
        }
      }

      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;

      return {
        success: results.errors.length === 0,
        results,
        summary: await this._generateExecutionSummary(plan, results)
      };
    } catch (error) {
      console.error('[Orchestrator] Execution error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Monitora e otimiza performance dos agents
   */
  async optimizeRouting() {
    console.log('[Orchestrator] Analyzing routing performance...');
    
    const metrics = Array.from(this.performanceMetrics.entries()).map(([agent, data]) => ({
      agent,
      avgResponseTime: data.totalTime / data.count,
      successRate: data.successes / data.count,
      totalRequests: data.count
    }));

    // Generate optimization suggestions
    const suggestions = await generateText({
      model: this.model,
      prompt: `
        Based on these performance metrics, suggest routing optimizations:
        
        ${JSON.stringify(metrics, null, 2)}
        
        Consider:
        - Load balancing
        - Success rates
        - Response times
        - Task complexity patterns
        
        Provide actionable optimization suggestions.
      `,
      maxTokens: 500
    });

    return {
      metrics,
      suggestions: suggestions.text,
      timestamp: new Date().toISOString()
    };
  }

  // Private helper methods
  _buildRoutingContext(message, context) {
    return {
      messageLength: message.length,
      hasCode: /```[\s\S]*```/.test(message),
      hasQuestion: /\?/.test(message),
      previousAgent: context.previousAgent,
      sessionHistory: context.sessionHistory?.slice(-5),
      timestamp: new Date().toISOString()
    };
  }

  _trackRoutingDecision(message, decision) {
    const key = `${decision.agent}-${Date.now()}`;
    this.routingHistory.set(key, {
      message: message.substring(0, 100),
      decision,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 routing decisions
    if (this.routingHistory.size > 100) {
      const firstKey = this.routingHistory.keys().next().value;
      this.routingHistory.delete(firstKey);
    }
  }

  async _executeSubtask(subtask, results, io, sessionId) {
    console.log(`[Orchestrator] Executing subtask: ${subtask.id}`);
    
    // Check dependencies
    for (const dep of subtask.dependencies) {
      if (!results.subtasks[dep]) {
        throw new Error(`Dependency ${dep} not satisfied for ${subtask.id}`);
      }
    }

    // Execute with appropriate agent
    const agent = this.agentManager.getAgent(subtask.agent);
    if (!agent) {
      throw new Error(`Agent ${subtask.agent} not found`);
    }

    const startTime = Date.now();
    
    try {
      const result = await agent.processMessage(
        subtask.description,
        sessionId,
        io
      );

      // Track performance
      this._updatePerformanceMetrics(subtask.agent, {
        time: Date.now() - startTime,
        success: true
      });

      return result;
    } catch (error) {
      this._updatePerformanceMetrics(subtask.agent, {
        time: Date.now() - startTime,
        success: false
      });
      throw error;
    }
  }

  _updatePerformanceMetrics(agent, metrics) {
    if (!this.performanceMetrics.has(agent)) {
      this.performanceMetrics.set(agent, {
        totalTime: 0,
        count: 0,
        successes: 0
      });
    }

    const data = this.performanceMetrics.get(agent);
    data.totalTime += metrics.time;
    data.count += 1;
    if (metrics.success) {
      data.successes += 1;
    }
  }

  async _generateExecutionSummary(plan, results) {
    const summary = await generateText({
      model: this.model,
      prompt: `
        Summarize the execution results:
        
        Original Task: ${plan.mainTask}
        
        Subtasks Completed: ${Object.keys(results.subtasks).length}/${plan.subtasks.length}
        
        Results:
        ${JSON.stringify(results.subtasks, null, 2)}
        
        Errors:
        ${JSON.stringify(results.errors, null, 2)}
        
        Duration: ${results.duration}ms
        
        Provide a concise summary of what was accomplished.
      `,
      maxTokens: 300
    });

    return summary.text;
  }
}

module.exports = Orchestrator;