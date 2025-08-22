/**
 * ClaudeAgentSDK - AI SDK Wrapper for Claude Agent
 * Implements LanguageModelV2 interface with structured outputs and multi-step processing
 */

const { generateText, generateObject, streamText } = require('ai');
const { claudeCode } = require('../../providers/ai-sdk-provider');
const { z } = require('zod');
const BaseAgent = require('./BaseAgent');

// Schemas for structured outputs
const CodeAnalysisSchema = z.object({
  language: z.string(),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  patterns: z.array(z.string()),
  suggestions: z.array(z.object({
    type: z.enum(['optimization', 'refactor', 'security', 'style']),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high'])
  })),
  dependencies: z.array(z.string()).optional()
});

const MultiStepPlanSchema = z.object({
  steps: z.array(z.object({
    order: z.number(),
    action: z.string(),
    description: z.string(),
    toolsRequired: z.array(z.string()).optional(),
    expectedOutput: z.string()
  })),
  estimatedDuration: z.number(),
  complexity: z.enum(['simple', 'moderate', 'complex'])
});

class ClaudeAgentSDK extends BaseAgent {
  constructor() {
    super('claude-sdk', 'Claude with AI SDK v5');
    
    // Initialize AI SDK provider
    this.model = claudeCode('opus');
    
    // Configuration
    this.config = {
      maxSteps: 10,
      temperature: 0.7,
      maxTokens: 4096,
      enableStructuredOutput: true,
      enableMultiStep: true,
      enableStreaming: true
    };
    
    // Step tracking
    this.stepHistory = new Map();
  }

  /**
   * Process message with AI SDK enhancements
   */
  async processMessage(message, sessionId, io) {
    console.log('[ClaudeAgentSDK] Processing with AI SDK v5...');
    
    try {
      // Check if message requires multi-step processing
      if (this.config.enableMultiStep && this._requiresMultiStep(message)) {
        return await this._processMultiStep(message, sessionId, io);
      }
      
      // Check if structured output is needed
      if (this.config.enableStructuredOutput && this._requiresStructuredOutput(message)) {
        return await this._processStructured(message, sessionId, io);
      }
      
      // Default to streaming text generation
      if (this.config.enableStreaming && io) {
        return await this._processStreaming(message, sessionId, io);
      }
      
      // Fallback to simple text generation
      return await this._processSimple(message);
    } catch (error) {
      console.error('[ClaudeAgentSDK] Processing error:', error);
      throw error;
    }
  }

  /**
   * Multi-step processing with stopWhen and stepCountIs
   */
  async _processMultiStep(message, sessionId, io) {
    console.log('[ClaudeAgentSDK] Starting multi-step processing...');
    
    // First, create execution plan
    const plan = await generateObject({
      model: this.model,
      schema: MultiStepPlanSchema,
      prompt: `Create a step-by-step plan for: "${message}"`
    });
    
    if (!plan.object) {
      throw new Error('Failed to create execution plan');
    }
    
    // Emit plan to frontend
    if (io) {
      io.to(sessionId).emit('claude:plan', {
        steps: plan.object.steps,
        estimatedDuration: plan.object.estimatedDuration
      });
    }
    
    // Execute steps with monitoring
    const results = [];
    let currentStep = 0;
    let shouldContinue = true;
    
    // Define stop condition
    const stopWhen = (step, results) => {
      // Stop if we've completed all planned steps
      if (currentStep >= plan.object.steps.length) return true;
      
      // Stop if we've hit max steps
      if (currentStep >= this.config.maxSteps) return true;
      
      // Stop if last result indicates completion
      const lastResult = results[results.length - 1];
      if (lastResult && lastResult.includes('COMPLETE')) return true;
      
      return false;
    };
    
    while (shouldContinue && currentStep < plan.object.steps.length) {
      const step = plan.object.steps[currentStep];
      
      // Emit step progress
      if (io) {
        io.to(sessionId).emit('claude:step', {
          current: currentStep + 1,
          total: plan.object.steps.length,
          description: step.description
        });
      }
      
      // Execute step
      const stepResult = await generateText({
        model: this.model,
        prompt: `
          Execute this step: ${step.description}
          Action: ${step.action}
          Expected Output: ${step.expectedOutput}
          
          Previous results: ${JSON.stringify(results.slice(-2))}
          
          Provide the result for this step.
        `,
        maxTokens: 1000,
        temperature: this.config.temperature,
        experimental_telemetry: {
          functionId: 'claude-multi-step',
          metadata: { 
            step: currentStep,
            sessionId 
          }
        }
      });
      
      results.push(stepResult.text);
      
      // Store step in history
      this._storeStepHistory(sessionId, currentStep, {
        step,
        result: stepResult.text,
        timestamp: Date.now()
      });
      
      // Check stop condition
      shouldContinue = !stopWhen(step, results);
      currentStep++;
      
      // Add callback for step completion
      if (this.config.onStepFinish) {
        await this.config.onStepFinish({
          step: currentStep,
          result: stepResult.text,
          plan: plan.object
        });
      }
    }
    
    // Generate final summary
    const summary = await generateText({
      model: this.model,
      prompt: `
        Summarize the results of this multi-step execution:
        
        Original Request: "${message}"
        
        Steps Completed: ${currentStep}/${plan.object.steps.length}
        
        Results:
        ${results.map((r, i) => `Step ${i + 1}: ${r}`).join('\n')}
        
        Provide a comprehensive summary.
      `,
      maxTokens: 500
    });
    
    return {
      content: summary.text,
      metadata: {
        agent: this.name,
        stepsCompleted: currentStep,
        totalSteps: plan.object.steps.length,
        multiStep: true
      },
      steps: results
    };
  }

  /**
   * Structured output processing
   */
  async _processStructured(message, sessionId, io) {
    console.log('[ClaudeAgentSDK] Generating structured output...');
    
    // Determine appropriate schema based on message
    const schema = this._selectSchema(message);
    
    const result = await generateObject({
      model: this.model,
      schema,
      prompt: message,
      experimental_telemetry: {
        functionId: 'claude-structured',
        metadata: { sessionId }
      }
    });
    
    if (!result.object) {
      throw new Error('Failed to generate structured output');
    }
    
    // Emit structured result
    if (io) {
      io.to(sessionId).emit('claude:structured', {
        type: schema.constructor.name,
        data: result.object
      });
    }
    
    return {
      content: JSON.stringify(result.object, null, 2),
      metadata: {
        agent: this.name,
        structured: true,
        schemaType: schema.constructor.name
      },
      data: result.object
    };
  }

  /**
   * Streaming text generation
   */
  async _processStreaming(message, sessionId, io) {
    console.log('[ClaudeAgentSDK] Starting streaming response...');
    
    const stream = await streamText({
      model: this.model,
      prompt: message,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      experimental_telemetry: {
        functionId: 'claude-streaming',
        metadata: { sessionId }
      }
    });
    
    let fullResponse = '';
    let chunkCount = 0;
    
    for await (const chunk of stream.textStream) {
      fullResponse += chunk;
      chunkCount++;
      
      // Emit chunk to frontend
      if (io) {
        io.to(sessionId).emit('message_chunk', {
          content: chunk,
          chunkNumber: chunkCount,
          agent: this.name
        });
      }
    }
    
    return {
      content: fullResponse,
      metadata: {
        agent: this.name,
        streaming: true,
        chunks: chunkCount
      }
    };
  }

  /**
   * Simple text generation
   */
  async _processSimple(message) {
    console.log('[ClaudeAgentSDK] Simple text generation...');
    
    const result = await generateText({
      model: this.model,
      prompt: message,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature
    });
    
    return {
      content: result.text,
      metadata: {
        agent: this.name,
        tokens: result.usage?.totalTokens
      }
    };
  }

  /**
   * Tool-based processing with toolChoice: 'required'
   */
  async processWithTools(message, tools, sessionId, io) {
    console.log('[ClaudeAgentSDK] Processing with required tools...');
    
    const result = await generateText({
      model: this.model,
      prompt: message,
      tools,
      toolChoice: 'required', // Force tool usage
      maxToolRoundtrips: 5,
      experimental_telemetry: {
        functionId: 'claude-tools',
        metadata: { 
          sessionId,
          toolCount: Object.keys(tools).length
        }
      }
    });
    
    // Process tool calls
    const toolResults = [];
    for (const toolCall of result.toolCalls || []) {
      if (io) {
        io.to(sessionId).emit('claude:tool_call', {
          tool: toolCall.toolName,
          args: toolCall.args
        });
      }
      
      toolResults.push({
        tool: toolCall.toolName,
        result: toolCall.result
      });
    }
    
    return {
      content: result.text,
      metadata: {
        agent: this.name,
        toolsUsed: toolResults.length,
        tools: toolResults
      }
    };
  }

  /**
   * Code analysis with structured output
   */
  async analyzeCode(code, language, sessionId) {
    console.log('[ClaudeAgentSDK] Analyzing code...');
    
    const analysis = await generateObject({
      model: this.model,
      schema: CodeAnalysisSchema,
      prompt: `
        Analyze this ${language} code:
        
        \`\`\`${language}
        ${code}
        \`\`\`
        
        Provide detailed analysis including complexity, patterns, and suggestions.
      `
    });
    
    return analysis.object;
  }

  /**
   * Continue from previous context
   */
  async continueConversation(sessionId, newMessage) {
    const history = this.stepHistory.get(sessionId) || [];
    
    const result = await generateText({
      model: this.model,
      messages: [
        ...history.map(h => ({
          role: 'assistant',
          content: h.result
        })),
        {
          role: 'user',
          content: newMessage
        }
      ],
      maxTokens: this.config.maxTokens
    });
    
    return result.text;
  }

  /**
   * Configure agent settings
   */
  configure(settings) {
    this.config = { ...this.config, ...settings };
    console.log('[ClaudeAgentSDK] Configuration updated:', this.config);
  }

  /**
   * Get agent capabilities for orchestration
   */
  getCapabilities() {
    return {
      streaming: this.config.enableStreaming,
      structured: this.config.enableStructuredOutput,
      multiStep: this.config.enableMultiStep,
      tools: true,
      codeAnalysis: true,
      maxTokens: this.config.maxTokens,
      models: ['sonnet-3.5', 'opus-3', 'haiku-3']
    };
  }

  // Private helper methods
  _requiresMultiStep(message) {
    const multiStepIndicators = [
      'step by step',
      'plan',
      'multiple',
      'sequence',
      'first.*then',
      'workflow',
      'process'
    ];
    
    return multiStepIndicators.some(indicator => 
      new RegExp(indicator, 'i').test(message)
    );
  }

  _requiresStructuredOutput(message) {
    const structuredIndicators = [
      'analyze',
      'extract',
      'structure',
      'format',
      'json',
      'schema',
      'data'
    ];
    
    return structuredIndicators.some(indicator => 
      new RegExp(indicator, 'i').test(message)
    );
  }

  _selectSchema(message) {
    // Simple schema selection based on keywords
    if (message.toLowerCase().includes('code')) {
      return CodeAnalysisSchema;
    }
    
    if (message.toLowerCase().includes('plan') || message.toLowerCase().includes('step')) {
      return MultiStepPlanSchema;
    }
    
    // Default generic schema
    return z.object({
      response: z.string(),
      category: z.string(),
      confidence: z.number()
    });
  }

  _storeStepHistory(sessionId, stepNumber, data) {
    if (!this.stepHistory.has(sessionId)) {
      this.stepHistory.set(sessionId, []);
    }
    
    const history = this.stepHistory.get(sessionId);
    history.push({
      step: stepNumber,
      ...data
    });
    
    // Keep only last 50 steps per session
    if (history.length > 50) {
      history.shift();
    }
  }
}

module.exports = ClaudeAgentSDK;