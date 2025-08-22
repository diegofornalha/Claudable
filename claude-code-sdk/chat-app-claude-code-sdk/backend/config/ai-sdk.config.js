/**
 * AI SDK v5 Configuration
 * Central configuration for all AI SDK services
 */

const config = {
  // Model configurations - Claude Code SDK (no API key needed)
  models: {
    default: 'claude-code-sdk',
    available: ['claude-code-sdk'],
    providers: {
      'claude-code-sdk': {
        type: 'integrated',
        authentication: 'built-in',
        description: 'Claude Code SDK with integrated authentication'
      }
    }
  },

  // Orchestrator settings
  orchestrator: {
    enabled: process.env.ORCHESTRATOR_ENABLED !== 'false',
    routingStrategy: 'intelligent', // intelligent | simple | random
    cacheRoutingDecisions: true,
    cacheTTL: 300000, // 5 minutes
    maxRoutingHistory: 100,
    defaultAgent: 'claude-sdk',
    fallbackAgent: 'claude-sdk',
    routingRules: [
      {
        pattern: /code|program|function|debug/i,
        agent: 'claude-sdk',
        confidence: 0.9
      },
      {
        pattern: /research|analyze|report|team/i,
        agent: 'crew-sdk',
        confidence: 0.8
      },
      {
        pattern: /parallel|multiple|batch/i,
        workflow: 'parallel',
        confidence: 0.85
      }
    ]
  },

  // Evaluator settings
  evaluator: {
    enabled: process.env.EVALUATOR_ENABLED !== 'false',
    qualityThreshold: parseFloat(process.env.QUALITY_THRESHOLD) || 7,
    maxRetries: parseInt(process.env.EVALUATOR_MAX_RETRIES) || 3,
    improvementEnabled: true,
    evaluationCriteria: {
      accuracy: { weight: 0.3, required: true },
      completeness: { weight: 0.25, required: true },
      relevance: { weight: 0.25, required: true },
      format: { weight: 0.1, required: false },
      safety: { weight: 0.1, required: true }
    },
    stopConditions: {
      maxAttempts: 5,
      minQualityScore: 6,
      timeLimit: 60000 // 1 minute
    }
  },

  // Parallel Executor settings
  parallel: {
    enabled: process.env.PARALLEL_ENABLED !== 'false',
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY) || 5,
    taskTimeout: parseInt(process.env.TASK_TIMEOUT) || 30000,
    failureStrategy: 'continue', // fail_fast | continue | retry_failed
    retryAttempts: 2,
    retryDelay: 1000,
    aggregationStrategies: {
      default: 'merge',
      available: ['merge', 'select_best', 'combine', 'vote', 'custom']
    },
    batchSize: 10,
    priorityLevels: 10
  },

  // Agent-specific configurations
  agents: {
    'claude-sdk': {
      maxTokens: 4096,
      temperature: 0.7,
      enableStreaming: true,
      enableStructuredOutput: true,
      enableMultiStep: true,
      maxSteps: 10,
      stepTimeout: 5000,
      tools: {
        enabled: true,
        maxToolRoundtrips: 5,
        toolChoice: 'auto' // auto | required | none
      }
    },
    'crew-sdk': {
      maxTokens: 2048,
      temperature: 0.8,
      crewSize: 5,
      coordinationMode: 'supervised', // autonomous | supervised | collaborative
      maxParallelTasks: 4,
      roles: [
        { name: 'researcher', weight: 0.25 },
        { name: 'analyst', weight: 0.25 },
        { name: 'writer', weight: 0.2 },
        { name: 'reviewer', weight: 0.15 },
        { name: 'coordinator', weight: 0.15 }
      ]
    }
  },

  // Performance settings
  performance: {
    enableMetrics: true,
    metricsInterval: 60000, // 1 minute
    enableCaching: true,
    cacheSize: 100,
    cacheTTL: 600000, // 10 minutes
    enableRateLimiting: true,
    rateLimit: {
      requests: 100,
      window: 60000 // 1 minute
    },
    monitoring: {
      enabled: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logToFile: false,
      logFilePath: './logs/ai-sdk.log'
    }
  },

  // Cost optimization
  costOptimization: {
    enabled: true,
    maxCostPerRequest: 0.5, // USD
    maxDailyCost: 100, // USD
    alertThreshold: 0.8, // Alert at 80% of limits
    strategies: {
      cacheFrequentRequests: true,
      useSmallModelsFirst: true,
      batchSimilarRequests: true,
      limitTokenUsage: true
    },
    modelCosts: {
      'sonnet-3.5': { input: 0.003, output: 0.015 },
      'opus-3': { input: 0.015, output: 0.075 },
      'haiku-3': { input: 0.00025, output: 0.00125 }
    }
  },

  // Security settings
  security: {
    enableValidation: true,
    maxRequestSize: 1048576, // 1MB
    sanitizeInputs: true,
    validateSchemas: true,
    allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || ['*'],
    rateLimiting: {
      enabled: true,
      maxRequestsPerMinute: 60,
      maxRequestsPerHour: 1000
    },
    authentication: {
      required: process.env.AUTH_REQUIRED === 'true',
      type: 'bearer', // bearer | api_key | jwt
      validateExpiry: true
    }
  },

  // Feature flags
  features: {
    enableOrchestration: true,
    enableQualityControl: true,
    enableParallelProcessing: true,
    enableStructuredOutput: true,
    enableMultiStep: true,
    enableStreaming: true,
    enableTools: true,
    enableCaching: true,
    enableMetrics: true,
    enableDebugMode: process.env.DEBUG === 'true'
  },

  // Webhook configurations
  webhooks: {
    enabled: process.env.WEBHOOKS_ENABLED === 'true',
    endpoints: {
      onRequestStart: process.env.WEBHOOK_REQUEST_START,
      onRequestComplete: process.env.WEBHOOK_REQUEST_COMPLETE,
      onRequestError: process.env.WEBHOOK_REQUEST_ERROR,
      onQualityAlert: process.env.WEBHOOK_QUALITY_ALERT,
      onCostAlert: process.env.WEBHOOK_COST_ALERT
    },
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000
  },

  // Development settings
  development: {
    mockResponses: process.env.MOCK_RESPONSES === 'true',
    verboseLogging: process.env.VERBOSE === 'true',
    recordRequests: process.env.RECORD_REQUESTS === 'true',
    playbackMode: process.env.PLAYBACK_MODE === 'true',
    testMode: process.env.NODE_ENV === 'test'
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  config.performance.enableMetrics = true;
  config.security.authentication.required = true;
  config.costOptimization.enabled = true;
  config.development.verboseLogging = false;
} else if (process.env.NODE_ENV === 'development') {
  config.development.verboseLogging = true;
  config.security.authentication.required = false;
  config.features.enableDebugMode = true;
}

// Validation function
function validateConfig() {
  const errors = [];
  
  // Validate required settings
  if (!config.models.default) {
    errors.push('Default model not configured');
  }
  
  if (config.evaluator.qualityThreshold < 0 || config.evaluator.qualityThreshold > 10) {
    errors.push('Quality threshold must be between 0 and 10');
  }
  
  if (config.parallel.maxConcurrency < 1) {
    errors.push('Max concurrency must be at least 1');
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation errors:', errors);
    process.exit(1);
  }
  
  return true;
}

// Export configuration
module.exports = {
  config,
  validateConfig,
  
  // Helper functions
  getModelConfig: (modelName) => {
    return config.agents[modelName] || config.agents['claude-sdk'];
  },
  
  getOrchestratorConfig: () => config.orchestrator,
  getEvaluatorConfig: () => config.evaluator,
  getParallelConfig: () => config.parallel,
  getSecurityConfig: () => config.security,
  getFeatureFlags: () => config.features,
  
  // Update configuration dynamically
  updateConfig: (path, value) => {
    const keys = path.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    validateConfig();
  },
  
  // Get configuration as JSON
  toJSON: () => JSON.stringify(config, null, 2)
};