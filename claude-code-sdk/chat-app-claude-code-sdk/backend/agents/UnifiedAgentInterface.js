/**
 * UnifiedAgentInterface - Common interface for all agents
 * Provides compatibility with AI SDK v5 and type safety with Zod schemas
 */

const { z } = require('zod');
const { generateText, generateObject } = require('ai');
const { claudeCode } = require('../../providers/ai-sdk-provider');

// Common schemas for all agents
const AgentCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  structured: z.boolean(),
  multiStep: z.boolean(),
  parallel: z.boolean(),
  tools: z.boolean(),
  evaluation: z.boolean(),
  maxTokens: z.number(),
  models: z.array(z.string()),
  specializations: z.array(z.string()).optional()
});

const AgentRequestSchema = z.object({
  message: z.string(),
  sessionId: z.string(),
  options: z.object({
    streaming: z.boolean().optional(),
    structured: z.boolean().optional(),
    maxTokens: z.number().optional(),
    temperature: z.number().optional(),
    tools: z.array(z.any()).optional(),
    context: z.any().optional()
  }).optional()
});

const AgentResponseSchema = z.object({
  content: z.string(),
  metadata: z.object({
    agent: z.string(),
    model: z.string().optional(),
    processingTime: z.number(),
    tokens: z.number().optional(),
    streaming: z.boolean().optional(),
    structured: z.boolean().optional(),
    multiStep: z.boolean().optional(),
    parallel: z.boolean().optional(),
    confidence: z.number().optional()
  }),
  data: z.any().optional(),
  steps: z.array(z.any()).optional(),
  errors: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional()
});

const AgentHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  lastActive: z.string(),
  requestsProcessed: z.number(),
  averageResponseTime: z.number(),
  errorRate: z.number(),
  capabilities: AgentCapabilitiesSchema
});

/**
 * Base interface that all agents must implement
 */
class UnifiedAgentInterface {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.model = null;
    this.capabilities = null;
    this.metrics = {
      requestsProcessed: 0,
      totalResponseTime: 0,
      errors: 0,
      lastActive: new Date().toISOString()
    };
  }

  /**
   * Initialize agent with AI SDK model
   */
  async initialize(modelConfig = {}) {
    const {
      provider = 'claude-code',
      model = 'sonnet-3.5',
      temperature = 0.7,
      maxTokens = 4096
    } = modelConfig;

    try {
      if (provider === 'claude-code') {
        const claudeProvider = claudeCodeProvider(model);
        this.model = claudeProvider.languageModel(model);
      }
      // Add other providers as needed

      this.modelConfig = { provider, model, temperature, maxTokens };
      this.capabilities = await this._defineCapabilities();
      
      console.log(`[${this.name}] Initialized with model: ${provider}/${model}`);
      return true;
    } catch (error) {
      console.error(`[${this.name}] Initialization failed:`, error);
      return false;
    }
  }

  /**
   * Process a message - must be implemented by subclasses
   */
  async processMessage(message, sessionId, io) {
    throw new Error('processMessage must be implemented by subclass');
  }

  /**
   * Process with validation and metrics
   */
  async process(request) {
    const startTime = Date.now();
    
    try {
      // Validate request
      const validatedRequest = AgentRequestSchema.parse(request);
      
      // Process message
      const response = await this.processMessage(
        validatedRequest.message,
        validatedRequest.sessionId,
        validatedRequest.options?.context?.io
      );
      
      // Validate response
      const validatedResponse = AgentResponseSchema.parse({
        ...response,
        metadata: {
          ...response.metadata,
          agent: this.name,
          processingTime: Date.now() - startTime
        }
      });
      
      // Update metrics
      this._updateMetrics(true, Date.now() - startTime);
      
      return validatedResponse;
    } catch (error) {
      // Update metrics
      this._updateMetrics(false, Date.now() - startTime);
      
      // Return error response
      return {
        content: `Error: ${error.message}`,
        metadata: {
          agent: this.name,
          processingTime: Date.now() - startTime,
          error: true
        },
        errors: [error.message]
      };
    }
  }

  /**
   * Generate text with AI SDK
   */
  async generateText(prompt, options = {}) {
    if (!this.model) {
      throw new Error(`Agent ${this.name} not initialized`);
    }

    const result = await generateText({
      model: this.model,
      prompt,
      maxTokens: options.maxTokens || this.modelConfig.maxTokens,
      temperature: options.temperature || this.modelConfig.temperature,
      ...options
    });

    return result.text;
  }

  /**
   * Generate structured output with AI SDK
   */
  async generateStructured(prompt, schema, options = {}) {
    if (!this.model) {
      throw new Error(`Agent ${this.name} not initialized`);
    }

    const result = await generateObject({
      model: this.model,
      schema,
      prompt,
      ...options
    });

    return result.object;
  }

  /**
   * Stream response with AI SDK
   */
  async *streamResponse(prompt, options = {}) {
    if (!this.model) {
      throw new Error(`Agent ${this.name} not initialized`);
    }

    const stream = await this.model.doStream({
      inputFormat: 'prompt',
      mode: 'regular',
      prompt,
      ...options
    });

    for await (const chunk of stream.textStream) {
      yield chunk;
    }
  }

  /**
   * Get agent health status
   */
  getHealth() {
    const health = {
      status: this._calculateHealthStatus(),
      lastActive: this.metrics.lastActive,
      requestsProcessed: this.metrics.requestsProcessed,
      averageResponseTime: this.metrics.requestsProcessed > 0 
        ? this.metrics.totalResponseTime / this.metrics.requestsProcessed 
        : 0,
      errorRate: this.metrics.requestsProcessed > 0
        ? this.metrics.errors / this.metrics.requestsProcessed
        : 0,
      capabilities: this.capabilities || this._getDefaultCapabilities()
    };

    return AgentHealthSchema.parse(health);
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return this.capabilities || this._getDefaultCapabilities();
  }

  /**
   * Configure agent settings
   */
  configure(settings) {
    // Merge settings with existing config
    if (settings.model) {
      this.initialize(settings.model);
    }
    
    // Allow subclasses to handle additional settings
    if (this.onConfigure) {
      this.onConfigure(settings);
    }
  }

  /**
   * Clone agent for parallel execution
   */
  async clone() {
    const ClonedClass = this.constructor;
    const clone = new ClonedClass();
    
    if (this.modelConfig) {
      await clone.initialize(this.modelConfig);
    }
    
    return clone;
  }

  /**
   * Compare with another agent
   */
  async compare(otherAgent, testMessage) {
    const [thisResponse, otherResponse] = await Promise.all([
      this.generateText(testMessage),
      otherAgent.generateText(testMessage)
    ]);

    return {
      [this.name]: thisResponse,
      [otherAgent.name]: otherResponse,
      comparison: await this._compareResponses(thisResponse, otherResponse)
    };
  }

  // Protected methods for subclasses
  
  /**
   * Define agent capabilities - override in subclass
   */
  async _defineCapabilities() {
    return this._getDefaultCapabilities();
  }

  /**
   * Get default capabilities
   */
  _getDefaultCapabilities() {
    return {
      streaming: false,
      structured: false,
      multiStep: false,
      parallel: false,
      tools: false,
      evaluation: false,
      maxTokens: 4096,
      models: ['sonnet-3.5'],
      specializations: []
    };
  }

  /**
   * Update metrics
   */
  _updateMetrics(success, responseTime) {
    this.metrics.requestsProcessed++;
    this.metrics.totalResponseTime += responseTime;
    if (!success) {
      this.metrics.errors++;
    }
    this.metrics.lastActive = new Date().toISOString();
  }

  /**
   * Calculate health status
   */
  _calculateHealthStatus() {
    const errorRate = this.metrics.requestsProcessed > 0
      ? this.metrics.errors / this.metrics.requestsProcessed
      : 0;

    const avgResponseTime = this.metrics.requestsProcessed > 0
      ? this.metrics.totalResponseTime / this.metrics.requestsProcessed
      : 0;

    // Health calculation logic
    if (errorRate > 0.1 || avgResponseTime > 10000) {
      return 'unhealthy';
    } else if (errorRate > 0.05 || avgResponseTime > 5000) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Compare two responses
   */
  async _compareResponses(response1, response2) {
    if (!this.model) {
      return { similarity: 'unknown' };
    }

    const comparison = await generateObject({
      model: this.model,
      schema: z.object({
        similarity: z.number().min(0).max(1),
        differences: z.array(z.string()),
        betterResponse: z.enum(['first', 'second', 'equal']),
        reasoning: z.string()
      }),
      prompt: `
        Compare these two responses:
        
        Response 1: "${response1}"
        Response 2: "${response2}"
        
        Analyze similarity, differences, and quality.
      `
    });

    return comparison.object;
  }

  /**
   * Export agent configuration
   */
  exportConfig() {
    return {
      name: this.name,
      description: this.description,
      modelConfig: this.modelConfig,
      capabilities: this.capabilities,
      metrics: this.metrics
    };
  }

  /**
   * Import agent configuration
   */
  async importConfig(config) {
    this.name = config.name || this.name;
    this.description = config.description || this.description;
    
    if (config.modelConfig) {
      await this.initialize(config.modelConfig);
    }
    
    if (config.metrics) {
      this.metrics = { ...this.metrics, ...config.metrics };
    }
  }
}

/**
 * Factory for creating unified agents
 */
class UnifiedAgentFactory {
  static agents = new Map();

  /**
   * Register an agent class
   */
  static register(name, AgentClass) {
    this.agents.set(name, AgentClass);
  }

  /**
   * Create an agent instance
   */
  static async create(name, config = {}) {
    const AgentClass = this.agents.get(name);
    
    if (!AgentClass) {
      throw new Error(`Agent ${name} not registered`);
    }

    const agent = new AgentClass();
    
    if (config.model) {
      await agent.initialize(config.model);
    }

    if (config.settings) {
      agent.configure(config.settings);
    }

    return agent;
  }

  /**
   * List registered agents
   */
  static list() {
    return Array.from(this.agents.keys());
  }

  /**
   * Create multiple agents for comparison
   */
  static async createMultiple(names, config = {}) {
    const agents = await Promise.all(
      names.map(name => this.create(name, config))
    );
    return agents;
  }
}

module.exports = { 
  UnifiedAgentInterface, 
  UnifiedAgentFactory,
  AgentCapabilitiesSchema,
  AgentRequestSchema,
  AgentResponseSchema,
  AgentHealthSchema
};