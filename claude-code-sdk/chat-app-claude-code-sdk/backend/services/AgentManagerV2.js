/**
 * AgentManagerV2 - Enhanced with AI SDK Provider v5
 * Integrates Orchestrator, Evaluator, and Parallel Executor services
 */

const Orchestrator = require('./ai-sdk/orchestrator');
const Evaluator = require('./ai-sdk/evaluator');
const ParallelExecutor = require('./ai-sdk/parallel-executor');
const StructuredOutput = require('./ai-sdk/structured-output');
const { z } = require('zod');

// Schema for agent response
const AgentResponseSchema = z.object({
  content: z.string(),
  metadata: z.object({
    agent: z.string(),
    processingTime: z.number(),
    confidence: z.number().optional(),
    sources: z.array(z.string()).optional()
  }),
  suggestions: z.array(z.string()).optional(),
  relatedTopics: z.array(z.string()).optional()
});

class AgentManagerV2 {
  constructor() {
    this.agents = new Map();
    this.orchestrator = new Orchestrator(this);
    this.evaluator = new Evaluator();
    this.parallelExecutor = new ParallelExecutor(this);
    this.structuredOutput = new StructuredOutput();
    
    // Configuration
    this.config = {
      enableOrchestration: true,
      enableQualityControl: true,
      enableParallelProcessing: true,
      qualityThreshold: 7,
      maxParallelAgents: 5,
      defaultTimeout: 30000
    };
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      orchestratedRequests: 0,
      parallelRequests: 0,
      qualityImprovedRequests: 0,
      averageResponseTime: 0,
      successRate: 0
    };
  }

  /**
   * Register an agent with the manager
   */
  registerAgent(name, agent) {
    console.log(`[AgentManagerV2] Registering agent: ${name}`);
    this.agents.set(name, agent);
    
    // Set agent capabilities for orchestration
    agent.capabilities = this._analyzeAgentCapabilities(agent);
  }

  /**
   * Get a registered agent
   */
  getAgent(name) {
    return this.agents.get(name);
  }

  /**
   * Get all available agents
   */
  getAvailableAgents() {
    return Array.from(this.agents.entries()).map(([name, agent]) => ({
      name,
      status: agent.status || 'unknown',
      capabilities: agent.capabilities || []
    }));
  }

  /**
   * Process message with AI SDK enhancements
   */
  async processMessage(message, sessionId, io, options = {}) {
    console.log('[AgentManagerV2] Processing message with AI SDK enhancements...');
    
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    try {
      // Step 1: Orchestration - Decide routing
      if (this.config.enableOrchestration) {
        return await this._processWithOrchestration(message, sessionId, io, options);
      } else {
        // Fallback to direct processing
        return await this._processDirectly(message, sessionId, io, options);
      }
    } catch (error) {
      console.error('[AgentManagerV2] Processing error:', error);
      
      // Update metrics
      this._updateMetrics({
        success: false,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * Process with orchestration
   */
  async _processWithOrchestration(message, sessionId, io, options) {
    console.log('[AgentManagerV2] Using orchestrated processing...');
    
    this.metrics.orchestratedRequests++;
    
    // Get routing decision
    const routingResult = await this.orchestrator.route(message, {
      sessionHistory: options.history,
      previousAgent: options.previousAgent
    });
    
    if (!routingResult.success) {
      // Fallback to default agent
      return await this._processDirectly(message, sessionId, io, {
        ...options,
        agent: 'claude'
      });
    }
    
    const decision = routingResult.decision;
    
    // Emit routing decision to frontend
    if (io) {
      io.to(sessionId).emit('orchestrator:routing', {
        agent: decision.agent,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        workflow: decision.suggestedWorkflow
      });
    }
    
    // Process based on suggested workflow
    switch (decision.suggestedWorkflow) {
      case 'parallel':
        return await this._processInParallel(message, sessionId, io, decision);
        
      case 'evaluator':
        return await this._processWithEvaluation(message, sessionId, io, decision);
        
      case 'orchestrated':
        return await this._processOrchestrated(message, sessionId, io, decision);
        
      default:
        return await this._processDirectly(message, sessionId, io, {
          ...options,
          agent: decision.agent
        });
    }
  }

  /**
   * Process with parallel execution
   */
  async _processInParallel(message, sessionId, io, decision) {
    console.log('[AgentManagerV2] Processing in parallel...');
    
    this.metrics.parallelRequests++;
    
    // Plan parallel execution
    const planResult = await this.parallelExecutor.planParallelExecution(
      message,
      this.getAvailableAgents()
    );
    
    if (!planResult.success) {
      throw new Error('Failed to plan parallel execution');
    }
    
    // Emit parallel plan to frontend
    if (io) {
      io.to(sessionId).emit('parallel:plan', {
        taskCount: planResult.plan.tasks.length,
        strategy: planResult.plan.aggregationStrategy
      });
    }
    
    // Execute in parallel
    const executionResult = await this.parallelExecutor.executeParallel(
      planResult.plan.tasks,
      {
        maxConcurrency: this.config.maxParallelAgents,
        failureStrategy: 'continue',
        io,
        sessionId
      }
    );
    
    if (!executionResult.success) {
      throw new Error('Parallel execution failed');
    }
    
    // Aggregate results
    const aggregatedResult = await this.parallelExecutor.aggregateResults(
      executionResult.results,
      planResult.plan.aggregationStrategy,
      message
    );
    
    // Structure the output
    const structured = await this.structuredOutput.generate(
      `Format this aggregated result: ${JSON.stringify(aggregatedResult.result)}`,
      AgentResponseSchema
    );
    
    if (io) {
      io.to(sessionId).emit('parallel:complete', {
        tasksCompleted: executionResult.statistics.successfulTasks,
        duration: executionResult.statistics.duration
      });
    }
    
    return structured.success ? structured.data : aggregatedResult.result;
  }

  /**
   * Process with quality evaluation
   */
  async _processWithEvaluation(message, sessionId, io, decision) {
    console.log('[AgentManagerV2] Processing with quality control...');
    
    // Define generation function
    const generateFn = async (request, context) => {
      const agent = this.getAgent(decision.agent);
      if (!agent) {
        throw new Error(`Agent ${decision.agent} not found`);
      }
      
      // Generate response
      const response = await agent.processMessage(request, sessionId, io);
      return typeof response === 'string' ? response : JSON.stringify(response);
    };
    
    // Run quality control loop
    const result = await this.evaluator.qualityControlLoop(
      generateFn,
      message,
      {
        targetScore: this.config.qualityThreshold,
        maxAttempts: 3,
        improveOnFail: true,
        criteria: {
          relevance: 'high',
          completeness: 'required',
          accuracy: 'critical'
        }
      }
    );
    
    if (result.improved) {
      this.metrics.qualityImprovedRequests++;
    }
    
    // Emit quality metrics
    if (io) {
      io.to(sessionId).emit('evaluator:quality', {
        score: result.evaluation?.score,
        attempts: result.attempts,
        improved: result.improved || false
      });
    }
    
    // Structure the output
    const structured = await this.structuredOutput.structureText(
      result.response,
      AgentResponseSchema,
      `Original request: ${message}`
    );
    
    return structured.success ? structured.data : { content: result.response };
  }

  /**
   * Process with full orchestration
   */
  async _processOrchestrated(message, sessionId, io, decision) {
    console.log('[AgentManagerV2] Full orchestrated processing...');
    
    // Decompose complex task
    const decomposition = await this.orchestrator.decomposeTask(message, {
      availableAgents: this.getAvailableAgents()
    });
    
    if (!decomposition.success) {
      // Fallback to simple processing
      return await this._processDirectly(message, sessionId, io, {
        agent: decision.agent
      });
    }
    
    // Emit task breakdown
    if (io) {
      io.to(sessionId).emit('orchestrator:breakdown', {
        mainTask: decomposition.plan.mainTask,
        subtaskCount: decomposition.plan.subtasks.length,
        parallelSteps: decomposition.metadata.parallelSteps
      });
    }
    
    // Execute orchestrated plan
    const executionResult = await this.orchestrator.orchestrateExecution(
      decomposition.plan,
      io,
      sessionId
    );
    
    if (!executionResult.success) {
      throw new Error('Orchestrated execution failed');
    }
    
    // Structure final result
    const structured = await this.structuredOutput.generate(
      `Create a comprehensive response from these execution results: ${JSON.stringify(executionResult.summary)}`,
      AgentResponseSchema
    );
    
    return structured.success ? structured.data : { 
      content: executionResult.summary,
      metadata: { agent: 'orchestrator' }
    };
  }

  /**
   * Direct processing without orchestration
   */
  async _processDirectly(message, sessionId, io, options) {
    const agentName = options.agent || 'claude';
    const agent = this.getAgent(agentName);
    
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    console.log(`[AgentManagerV2] Direct processing with ${agentName}...`);
    
    const startTime = Date.now();
    const response = await agent.processMessage(message, sessionId, io);
    const duration = Date.now() - startTime;
    
    // Update metrics
    this._updateMetrics({
      success: true,
      duration,
      agent: agentName
    });
    
    // Try to structure the response
    if (typeof response === 'string') {
      const structured = await this.structuredOutput.structureText(
        response,
        AgentResponseSchema,
        `Agent: ${agentName}, Request: ${message}`
      );
      
      if (structured.success) {
        return structured.data;
      }
    }
    
    return response;
  }

  /**
   * Compare multiple agents' responses
   */
  async compareAgents(message, agentNames, sessionId, io) {
    console.log(`[AgentManagerV2] Comparing ${agentNames.length} agents...`);
    
    // Generate responses from all agents
    const responses = [];
    
    for (const agentName of agentNames) {
      try {
        const response = await this._processDirectly(
          message,
          sessionId,
          io,
          { agent: agentName }
        );
        responses.push(response);
      } catch (error) {
        console.error(`[AgentManagerV2] Agent ${agentName} failed:`, error);
        responses.push(null);
      }
    }
    
    // Filter out failed responses
    const validResponses = responses.filter(r => r !== null);
    
    if (validResponses.length === 0) {
      throw new Error('All agents failed to generate responses');
    }
    
    // Use evaluator to select best response
    const comparison = await this.evaluator.selectBestResponse(
      validResponses.map(r => typeof r === 'string' ? r : r.content || JSON.stringify(r)),
      message
    );
    
    // Emit comparison results
    if (io) {
      io.to(sessionId).emit('comparison:results', {
        agents: agentNames,
        bestAgent: agentNames[responses.indexOf(comparison.bestResponse)],
        bestScore: comparison.bestScore,
        summary: comparison.summary
      });
    }
    
    return comparison;
  }

  /**
   * Get performance report
   */
  async getPerformanceReport() {
    const orchestratorMetrics = await this.orchestrator.optimizeRouting();
    const evaluatorMetrics = this.evaluator.getQualityMetrics();
    const parallelMetrics = this.parallelExecutor.getPerformanceMetrics();
    
    return {
      overview: this.metrics,
      orchestration: orchestratorMetrics,
      quality: evaluatorMetrics,
      parallel: parallelMetrics,
      recommendations: this._generateRecommendations()
    };
  }

  /**
   * Configure manager settings
   */
  configure(settings) {
    this.config = { ...this.config, ...settings };
    console.log('[AgentManagerV2] Configuration updated:', this.config);
  }

  // Private helper methods
  _analyzeAgentCapabilities(agent) {
    const capabilities = [];
    
    // Analyze based on agent type and methods
    if (agent.constructor.name.includes('Claude')) {
      capabilities.push('coding', 'reasoning', 'general');
    }
    if (agent.constructor.name.includes('Crew')) {
      capabilities.push('research', 'collaboration', 'multi-agent');
    }
    if (agent.processMessage) {
      capabilities.push('messaging');
    }
    if (agent.streamResponse) {
      capabilities.push('streaming');
    }
    
    return capabilities;
  }

  _updateMetrics(data) {
    if (data.success) {
      const currentTotal = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
      this.metrics.averageResponseTime = (currentTotal + data.duration) / this.metrics.totalRequests;
    }
    
    // Update success rate
    const successCount = Math.floor(this.metrics.successRate * (this.metrics.totalRequests - 1));
    this.metrics.successRate = (successCount + (data.success ? 1 : 0)) / this.metrics.totalRequests;
  }

  _generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.averageResponseTime > 5000) {
      recommendations.push('Consider enabling parallel processing for faster responses');
    }
    
    if (this.metrics.successRate < 0.9) {
      recommendations.push('Enable quality control to improve success rate');
    }
    
    if (this.metrics.orchestratedRequests / this.metrics.totalRequests < 0.5) {
      recommendations.push('Orchestration is underutilized - consider enabling for more requests');
    }
    
    return recommendations;
  }
}

module.exports = AgentManagerV2;